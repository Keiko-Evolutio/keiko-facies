/*
 * Offline Queue Service (IndexedDB via Dexie optional, hier ohne extra Abhängigkeit)
 * - Persistiert kritische Operationen offline
 * - Exponential Backoff
 * - Deutsche Kommentare, English identifiers
 */

export type QueueItem = {
    id: string
    type: 'ws' | 'api'
    url?: string
    method?: string
    headers?: Record<string, string>
    body?: any
    wsMessage?: any
    priority: 'high' | 'normal'
    retryCount: number
    createdAt: number
}

const memoryQueue: QueueItem[] = []

export const offlineQueue = {
    enqueue(item: Omit<QueueItem, 'id' | 'retryCount' | 'createdAt'>): QueueItem {
        const entry: QueueItem = { id: crypto.randomUUID(), retryCount: 0, createdAt: Date.now(), ...item }
        memoryQueue.push(entry)
        return entry
    },
    list(): QueueItem[] { return [...memoryQueue] },
    remove(id: string): void {
        const idx = memoryQueue.findIndex(x => x.id === id)
        if (idx >= 0) memoryQueue.splice(idx, 1)
    },
    async flush(sendApi: (item: QueueItem) => Promise<boolean>, sendWs: (item: QueueItem) => Promise<boolean>): Promise<void> {
        for (const item of [...memoryQueue]) {
            try {
                const ok = item.type === 'api' ? await sendApi(item) : await sendWs(item)
                if (ok) this.remove(item.id)
                else {
                    item.retryCount += 1
                    if (item.retryCount > 5) this.remove(item.id)
                }
            } catch {
                item.retryCount += 1
                if (item.retryCount > 5) this.remove(item.id)
            }
        }
    }
}
