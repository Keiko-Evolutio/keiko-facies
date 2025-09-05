/**
 * Periodischer Scheduler für Offline-Queue Metriken.
 * Ruft reportQueueMetrics() alle X Sekunden auf (Default 30s) mit Backoff.
 */

import { reportQueueMetrics } from '@/services/offline/requestQueue'

let handle: number | null = null
let baseInterval = Number((import.meta as any).env?.VITE_QUEUE_METRICS_INTERVAL_MS || 30000)

/** Startet den Scheduler. */
export function startQueueMetricsScheduler(): void {
    if (handle !== null) return
    let attempt = 0
    const tick = async () => {
        try {
            await reportQueueMetrics()
            attempt = 0
        } catch (_) {
            attempt += 1
        } finally {
            const backoff = Math.min(3, attempt)
            const wait = baseInterval * Math.pow(2, backoff)
            handle = window.setTimeout(tick, wait)
        }
    }
    handle = window.setTimeout(tick, baseInterval)
}

/** Stoppt den Scheduler. */
export function stopQueueMetricsScheduler(): void {
    if (handle !== null) {
        clearTimeout(handle)
        handle = null
    }
}
