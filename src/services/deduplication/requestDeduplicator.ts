/**
 * RequestDeduplicator – verhindert doppelte in-flight Requests.
 * Fingerprint: METHOD + URL + Body-Hash
 */

export type DedupKey = string

function hashBody(body: any): string {
    try {
        const s = typeof body === 'string' ? body : JSON.stringify(body)
        let h = 0
        for (let i = 0; i < s.length; i++) {
            h = (h << 5) - h + s.charCodeAt(i)
            h |= 0
        }
        return h.toString(16)
    } catch {
        return '0'
    }
}

export class RequestDeduplicator {
    private inflight: Map<DedupKey, Promise<any>> = new Map()
    private ttlMs: number

    constructor(ttlMs: number = 5000) {
        this.ttlMs = ttlMs
    }

    buildKey(method: string, url: string, body?: any): DedupKey {
        return `${method.toUpperCase()}::${url}::${hashBody(body || '')}`
    }

    async run<T>(key: DedupKey, factory: () => Promise<T>): Promise<T> {
        const existing = this.inflight.get(key)
        if (existing) return existing as Promise<T>
        const p = factory()
        this.inflight.set(key, p)
        const clear = () => {
            setTimeout(() => this.inflight.delete(key), this.ttlMs)
        }
        p.then(clear, clear)
        return p
    }
}

export const defaultDeduplicator = new RequestDeduplicator(Number((import.meta as any).env?.VITE_REQUEST_DEDUP_TTL_MS || 5000))
