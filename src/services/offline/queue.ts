// src/services/offline/queue.ts
// IndexedDB-basierte Offline-Queue für Schreiboperationen mit Background Sync

import { idbGet, idbPut, idbDelete } from '@/services/cache/indexeddb'
import { logClientError } from '@/services/error-logging'

type WriteItem = {
    id: string
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url: string
    body?: any
    headers?: Record<string, string>
    attempts: number
    maxAttempts: number
    priority?: 'high' | 'normal' | 'low'
    timestamp?: number
}

export interface QueueStats {
    totalRequests: number
    highPriorityRequests: number
    failedRequests: number
    lastFlushTime: number | null
}

const QUEUE_KEY = 'offline-write-queue'
const BACKGROUND_SYNC_TAG = 'keiko-background-sync'

/**
 * Prüft ob Background Sync unterstützt wird.
 */
function isBackgroundSyncSupported(): boolean {
    return (
        'serviceWorker' in navigator &&
        'sync' in window.ServiceWorkerRegistration.prototype
    )
}

/**
 * Fügt Item zur Offline-Queue hinzu und triggert Background Sync.
 */
export async function enqueue(item: Omit<WriteItem, 'id' | 'attempts' | 'maxAttempts'>): Promise<string> {
    const id = 'q_' + Math.random().toString(36).slice(2)
    const entry: WriteItem = {
        id,
        attempts: 0,
        maxAttempts: 5,
        priority: 'normal',
        timestamp: Date.now(),
        ...item
    }

    const list = (await idbGet<WriteItem[]>(QUEUE_KEY)) || []
    list.push(entry)
    await idbPut(QUEUE_KEY, list)

    // Background Sync triggern falls unterstützt
    if (isBackgroundSyncSupported()) {
        try {
            const registration = await navigator.serviceWorker.ready
            await registration.sync.register(BACKGROUND_SYNC_TAG)
        } catch (error) {
            await logClientError({
                level: 'warning',
                message: 'Background Sync registration failed',
                error: error as Error,
                context: { itemId: id }
            })
        }
    }

    return id
}

/**
 * Verarbeitet Queue mit optionalem Processor.
 */
export async function flush(processor?: (item: WriteItem) => Promise<boolean>): Promise<void> {
    const list = (await idbGet<WriteItem[]>(QUEUE_KEY)) || []

    if (!processor) {
        // Standard-Processor: Versuche HTTP-Request
        processor = async (item: WriteItem): Promise<boolean> => {
            try {
                const response = await fetch(item.url, {
                    method: item.method,
                    headers: {
                        'Content-Type': 'application/json',
                        ...item.headers
                    },
                    body: item.body ? JSON.stringify(item.body) : undefined
                })
                return response.ok
            } catch {
                return false
            }
        }
    }

    const remaining: WriteItem[] = []

    // Sortiere nach Priorität: high zuerst, dann nach Timestamp
    const sortedList = list.sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return -1
        if (a.priority !== 'high' && b.priority === 'high') return 1
        return (a.timestamp || 0) - (b.timestamp || 0)
    })

    for (const item of sortedList) {
        try {
            const success = await processor(item)
            if (!success) {
                item.attempts += 1
                if (item.attempts < item.maxAttempts) {
                    remaining.push(item)
                }
            }
        } catch (error) {
            item.attempts += 1
            if (item.attempts < item.maxAttempts) {
                remaining.push(item)
            }

            await logClientError({
                level: 'warning',
                message: 'Queue item processing failed',
                error: error as Error,
                context: { itemId: item.id, attempts: item.attempts }
            })
        }
    }

    await idbPut(QUEUE_KEY, remaining)
    localStorage.setItem('keiko-last-flush', Date.now().toString())

    // Wenn noch Items vorhanden: Nächsten Background Sync planen
    if (remaining.length > 0 && isBackgroundSyncSupported()) {
        try {
            const registration = await navigator.serviceWorker.ready
            // Exponential Backoff
            const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, remaining[0]?.attempts || 0)))
            setTimeout(async () => {
                await registration.sync.register(BACKGROUND_SYNC_TAG)
            }, delay)
        } catch (error) {
            await logClientError({
                level: 'warning',
                message: 'Background Sync re-registration failed',
                error: error as Error
            })
        }
    }
}

/**
 * Holt Queue-Statistiken für Monitoring.
 */
export async function getQueueStats(): Promise<QueueStats> {
    try {
        const list = (await idbGet<WriteItem[]>(QUEUE_KEY)) || []

        const highPriorityRequests = list.filter(item => item.priority === 'high').length
        const failedRequests = list.filter(item => item.attempts >= item.maxAttempts).length
        const lastFlushTime = localStorage.getItem('keiko-last-flush')
            ? parseInt(localStorage.getItem('keiko-last-flush')!, 10)
            : null

        return {
            totalRequests: list.length,
            highPriorityRequests,
            failedRequests,
            lastFlushTime
        }
    } catch (error) {
        await logClientError({
            level: 'warning',
            message: 'Failed to get queue stats',
            error: error as Error
        })

        return {
            totalRequests: 0,
            highPriorityRequests: 0,
            failedRequests: 0,
            lastFlushTime: null
        }
    }
}

/**
 * Löscht alle Items aus der Queue (für Testing/Reset).
 */
export async function clearQueue(): Promise<void> {
    try {
        await idbPut(QUEUE_KEY, [])
    } catch (error) {
        await logClientError({
            level: 'warning',
            message: 'Failed to clear queue',
            error: error as Error
        })
    }
}

/**
 * Fügt kritischen Request mit hoher Priorität hinzu.
 */
export async function enqueueHighPriority(
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: any,
    headers?: Record<string, string>
): Promise<string> {
    return enqueue({
        method,
        url,
        body,
        headers,
        priority: 'high'
    })
}
