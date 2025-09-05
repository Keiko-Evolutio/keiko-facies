/*
 * Offline Request Queue – Produktionsreife Implementierung
 *
 * - Speichert Schreib-Requests (POST/PUT/PATCH) in IndexedDB
 * - Metadaten: Timestamps, Retry Counts, Prioritäten, Correlation IDs (tenantId, traceId)
 * - LRU-Limit: konfigurierbare Queue-Größe (VITE_QUEUE_MAX_SIZE, Default 1000)
 * - Exponentielles Backoff mit Jitter: Start 1s, Max 300s, Faktor 2.0
 * - Status-Helper & Metriken: Summary, Failed Requests, Pending Count, reportQueueMetrics()
 * - Deutsche Kommentare, strenges TypeScript
 */

import { QUEUE_METRICS_ENDPOINT } from '@/store/endpoint'

export type QueuePriority = 'critical' | 'normal' | 'low'

export interface QueuedRequest {
    id: string
    url: string
    method: 'POST' | 'PUT' | 'PATCH'
    body: any
    headers: Record<string, string>
    priority: QueuePriority
    createdAt: number
    retries: number
    maxRetries: number
    tenantId?: string | null
    traceId?: string | null
    nextAttemptAt?: number
}

const DB_NAME = 'keiko-offline'
const STORE = 'requests'
const VERSION = 3
const MAX_QUEUE_SIZE = Number((import.meta as any).env?.VITE_QUEUE_MAX_SIZE || 1000)
const MAX_RETRY_ATTEMPTS = Number((import.meta as any).env?.VITE_QUEUE_MAX_RETRY_ATTEMPTS || 3)

// Backoff-Parameter
const BACKOFF_START_MS = 1000
const BACKOFF_MAX_MS = 300000
const BACKOFF_FACTOR = 2.0

let _lastSyncTs = 0
let _syncing = false
let _lastError: string | null = null

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE)) {
                const os = db.createObjectStore(STORE, { keyPath: 'id' })
                os.createIndex('priority', 'priority', { unique: false })
                os.createIndex('createdAt', 'createdAt', { unique: false })
                os.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false })
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

function jitter(ms: number): number {
    // +/- 25% Jitter
    const delta = ms * 0.25
    return Math.floor(ms - delta + Math.random() * (2 * delta))
}

/** Fügt Request zur Queue hinzu (LRU-Limit gilt). */
export async function enqueue(req: {
    url: string
    method: 'POST' | 'PUT' | 'PATCH'
    body: any
    headers: Record<string, string>
    priority: QueuePriority
    tenantId?: string | null
    traceId?: string | null
    maxRetries?: number
}): Promise<void> {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const item: QueuedRequest = {
        id: (crypto as any).randomUUID ? crypto.randomUUID() : 'q_' + Math.random().toString(36).slice(2),
        url: req.url,
        method: req.method,
        body: req.body,
        headers: req.headers,
        priority: req.priority,
        createdAt: Date.now(),
        retries: 0,
        maxRetries: typeof req.maxRetries === 'number' ? req.maxRetries : MAX_RETRY_ATTEMPTS,
        tenantId: req.tenantId ?? null,
        traceId: req.traceId ?? null,
        nextAttemptAt: Date.now(),
    }
    store.put(item)
    await tx.complete
    await enforceQueueLimit()
}

/** Erzwingt LRU-Queue-Limit, entfernt älteste Einträge bei Überschreitung. */
async function enforceQueueLimit(): Promise<void> {
    const all = await listAll()
    if (all.length <= MAX_QUEUE_SIZE) return
    const overflow = all.sort((a, b) => a.createdAt - b.createdAt).slice(0, all.length - MAX_QUEUE_SIZE)
    for (const o of overflow) await remove(o.id)
}

async function listAll(): Promise<QueuedRequest[]> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const store = tx.objectStore(STORE)
        const req = store.getAll()
        req.onsuccess = () => resolve((req.result || []) as QueuedRequest[])
        req.onerror = () => reject(req.error)
    })
}

async function remove(id: string): Promise<void> {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    await tx.complete
}

function sortByPriority(a: QueuedRequest, b: QueuedRequest): number {
    const p = { critical: 0, normal: 1, low: 2 } as const
    if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority]
    return a.createdAt - b.createdAt
}

/** Versucht Queue zu flushen; setzt Backoff bei Fehlern. */
export async function flush(): Promise<{ sent: number; failed: number }> {
    const now = Date.now()
    const items = (await listAll()).filter((i) => (i.nextAttemptAt || 0) <= now).sort(sortByPriority)
    let sent = 0
    let failed = 0
    _syncing = true
    for (const it of items) {
        try {
            const res = await fetch(it.url, {
                method: it.method,
                headers: { 'Content-Type': 'application/json', ...it.headers },
                body: JSON.stringify(it.body || {}),
            })
            if (!res.ok) throw new Error('HTTP ' + res.status)
            await remove(it.id)
            sent += 1
            _lastError = null
        } catch (e: any) {
            failed += 1
            try {
                it.retries += 1
                if (it.retries > (it.maxRetries || MAX_RETRY_ATTEMPTS)) {
                    await remove(it.id)
                } else {
                    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * Math.pow(BACKOFF_FACTOR, it.retries - 1))
                    it.nextAttemptAt = Date.now() + jitter(base)
                    const db = await openDB()
                    const tx = db.transaction(STORE, 'readwrite')
                    tx.objectStore(STORE).put(it)
                    await tx.complete
                }
            } catch (err: any) {
                _lastError = String(err?.message || 'flush_error')
            }
        }
    }
    _syncing = false
    if (sent > 0 && failed === 0) _lastSyncTs = Date.now()
    return { sent, failed }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        flush().catch(() => { })
    })
}

/** Gibt kompakten Queue-Status zurück. */
export async function getQueueSummary(): Promise<{
    size: number
    critical: number
    normal: number
    low: number
    syncing: boolean
    lastSyncTs: number
    lastError: string | null
}> {
    const all = await listAll()
    return {
        size: all.length,
        critical: all.filter((i) => i.priority === 'critical').length,
        normal: all.filter((i) => i.priority === 'normal').length,
        low: all.filter((i) => i.priority === 'low').length,
        syncing: _syncing,
        lastSyncTs: _lastSyncTs,
        lastError: _lastError,
    }
}

/** Liefert fehlgeschlagene Requests (maxRetries erreicht). */
export async function getFailedRequests(): Promise<QueuedRequest[]> {
    const all = await listAll()
    return all.filter((i) => i.retries >= (i.maxRetries || MAX_RETRY_ATTEMPTS))
}

/** Liefert Anzahl ausstehender Requests. */
export async function getPendingCount(): Promise<number> {
    const all = await listAll()
    const now = Date.now()
    return all.filter((i) => (i.nextAttemptAt || 0) <= now).length
}

/** Sendet Queue-Metriken an Backend. */
export async function reportQueueMetrics(): Promise<void> {
    const s = await getQueueSummary()
    const payload = {
        queue_size: s.size,
        critical: s.critical,
        normal: s.normal,
        low: s.low,
        syncing: s.syncing,
        last_sync_ts: s.lastSyncTs,
        error: s.lastError,
        ts: Date.now(),
    }
    try {
        if (navigator.sendBeacon) {
            navigator.sendBeacon(
                QUEUE_METRICS_ENDPOINT,
                new Blob([JSON.stringify(payload)], { type: 'application/json' }),
            )
        } else {
            await fetch(QUEUE_METRICS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true,
            })
        }
    } catch (_) {
        // Metrik-Fehler sind best effort
    }
}
