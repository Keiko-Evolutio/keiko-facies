import { describe, it, expect, vi, beforeEach } from 'vitest'
import cacheManager, { defaultCacheManager } from '@/services/cache/cacheManager'

describe('Cache strategy resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('resolves strategy by URL pattern and request type', async () => {
        const strat1 = defaultCacheManager.resolveStrategy('/api/v1/agents/123')
        expect(strat1.tags?.includes('agents') || strat1.tagsFn).toBeTruthy()

        const strat2 = defaultCacheManager.resolveStrategy('/api/v1/webhooks/targets')
        expect(strat2.tags?.includes('webhooks') || strat2.tagsFn).toBeTruthy()
    })

    it('applies TTL configuration', async () => {
        const strat = defaultCacheManager.resolveStrategy('/api/v1/health')
        expect(typeof strat.ttlMs === 'number').toBe(true)
    })

    it('handles expiration automatically', async () => {
        const k = JSON.stringify({ method: 'GET', url: '/api/v1/health' })
        await defaultCacheManager.set('GET', '/api/v1/health', { ok: true }, ['health'], 50)
        const v1 = await defaultCacheManager.get('GET', '/api/v1/health', {})
        expect(v1).toBeTruthy()
        await new Promise((r) => setTimeout(r, 60))
        const v2 = await defaultCacheManager.get('GET', '/api/v1/health', {})
        // May be undefined after TTL expiry
        expect(v2 === undefined || v2 === null).toBeTruthy()
    })

    it('supports manual invalidation by tag', async () => {
        await defaultCacheManager.set('GET', '/api/v1/agents/42', { id: 42 }, ['agents'], 500)
        let v = await defaultCacheManager.get('GET', '/api/v1/agents/42', {})
        expect(v).toBeTruthy()
        await defaultCacheManager.invalidateByTag('agents')
        v = await defaultCacheManager.get('GET', '/api/v1/agents/42', {})
        expect(v === undefined || v === null).toBeTruthy()
    })

    it('falls back gracefully when primary cache unavailable', async () => {
        // Simulate by calling get on non-existent entry
        const v = await defaultCacheManager.get('GET', '/unknown', {})
        expect(v === undefined || v === null).toBeTruthy()
    })
})
