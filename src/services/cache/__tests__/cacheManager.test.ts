import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CacheManager } from '@/services/cache/cacheManager'

// Mock IndexedDB Wrapper
vi.mock('@/services/cache/indexeddb', () => ({
    idbGet: vi.fn(async () => undefined),
    idbPut: vi.fn(async () => { }),
    idbDelete: vi.fn(async () => { }),
}))

describe('CacheManager', () => {
    beforeEach(() => vi.clearAllMocks())
    it('stores and retrieves cached GET data with TTL', async () => {
        const { idbGet } = await import('@/services/cache/indexeddb') as any
        const cm = new CacheManager({ defaultStrategy: { ttlMs: 1000, mode: 'cache-first' } })
        await cm.set('GET', '/api/v1/webhooks/targets', { items: [] }, ['webhooks'], 1000)
        idbGet.mockResolvedValueOnce({ key: 'GET:/api/v1/webhooks/targets:', data: { items: [] }, createdAt: Date.now(), ttlMs: 1000, tags: ['webhooks'] })
        const hit = await cm.get('GET', '/api/v1/webhooks/targets')
        expect(hit).toEqual({ items: [] })
    })

    it('invalidates by tag', async () => {
        const { idbDelete } = await import('@/services/cache/indexeddb') as any
        const cm = new CacheManager()
        await cm.set('GET', '/a', { ok: 1 }, ['x'], 1000)
        await cm.invalidateByTag('x')
        expect(idbDelete).toHaveBeenCalled()
    })
})
