import type { CacheConfig, CacheEntry } from './types'
import { idbGet, idbPut, idbDelete } from './indexeddb'

/**
 * CacheManager – verwaltet HTTP-Cache mit TTL, Tags und Strategien.
 */
export class CacheManager {
    private config: CacheConfig
    private tagIndex: Map<string, Set<string>> = new Map()

    constructor(config?: Partial<CacheConfig>) {
        this.config = {
            defaultStrategy: { ttlMs: 60_000, mode: 'network-first' },
            perEndpoint: [],
            ...config,
        } as CacheConfig
    }

    // Ermittelt Strategie anhand URL (öffentlich, da vom API-Client genutzt)
    resolveStrategy(url: string) {
        const specific = this.config.perEndpoint?.find((e) => e.pattern.test(url))
        return specific?.strategy || this.config.defaultStrategy
    }

    private buildKey(method: string, url: string, headers?: Record<string, string>): string {
        const vary = headers?.['X-Cache-Vary'] || ''
        return `${method}:${url}:${vary}`
    }

    async get<T>(method: string, url: string, headers?: Record<string, string>): Promise<T | undefined> {
        const key = this.buildKey(method, url, headers)
        const entry = await idbGet<CacheEntry<T>>(key)
        if (!entry) return undefined
        const expired = Date.now() - entry.createdAt > entry.ttlMs
        if (expired) {
            await idbDelete(key)
            return undefined
        }
        return entry.data
    }

    async set<T>(method: string, url: string, data: T, tags: string[], ttlMs: number, headers?: Record<string, string>): Promise<void> {
        const key = this.buildKey(method, url, headers)
        const entry: CacheEntry<T> = { key, tags, createdAt: Date.now(), ttlMs, data }
        await idbPut(key, entry)
        // Tag-Index aktualisieren
        tags.forEach((tag) => {
            if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set<string>())
            this.tagIndex.get(tag)!.add(key)
        })
    }

    async invalidateByTag(tag: string): Promise<void> {
        const keys = Array.from(this.tagIndex.get(tag) || [])
        await Promise.all(keys.map((k) => idbDelete(k)))
        this.tagIndex.delete(tag)
    }

    // ETag-basierte Invalidation
    async updateWithETag<T>(method: string, url: string, response: Response, data: T, tags: string[], ttlMs: number): Promise<void> {
        const etag = response.headers.get('ETag') || ''
        await this.set(method, url, data, tags, ttlMs, { 'X-Cache-Vary': etag })
    }
}

// Cache-Warming für kritische Endpunkte (Best Effort)
export async function warmCriticalCaches(): Promise<void> {
    const critical: string[] = [
        '/api/v1/agents',
        '/api/v1/webhooks/targets',
        '/api/v1/configurations',
    ]
    await Promise.all(
        critical.map(async (path) => {
            try { await fetch(path, { method: 'GET', headers: { 'X-Cache-Warm': '1' } }) } catch (_) { }
        })
    )
}

export const defaultCacheManager = new CacheManager({
    defaultStrategy: { ttlMs: 60_000, mode: 'network-first' },
    perEndpoint: [
        // Agents
        { pattern: /\/api\/v1\/agents\b/, strategy: { ttlMs: 60_000, mode: 'cache-first', tags: ['agents'] } },
        // User: id im Pfad → dynamische Tag Ableitung via tagsFn
        { pattern: /\/api\/v1\/users\//, strategy: { ttlMs: 300_000, mode: 'cache-first', tagsFn: (url) => { const m = url.match(/\/users\/(\w+)/); return m ? [`user:${m[1]}`] : ['user'] } } },
        // Webhooks Targets/Deliveries
        { pattern: /\/api\/v1\/webhooks\//, strategy: { ttlMs: 60_000, mode: 'cache-first', tags: ['webhooks'] } },
        // Configurations
        { pattern: /\/api\/v1\/configurations\b/, strategy: { ttlMs: 600_000, mode: 'cache-first', tags: ['configurations'] } },
        // Metrics
        { pattern: /\/api\/v1\/metrics\//, strategy: { ttlMs: 30_000, mode: 'network-first', tags: ['metrics'] } },
    ],
})
