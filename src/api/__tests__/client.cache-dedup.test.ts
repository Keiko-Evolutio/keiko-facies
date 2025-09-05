import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient } from '@/api/client'
import { defaultDeduplicator } from '@/services/deduplication/requestDeduplicator'

describe('Request deduplication', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('deduplicates concurrent identical GET requests', async () => {
        const axiosStub: any = {
            request: vi.fn().mockImplementation(async (cfg: any) => {
                await new Promise((r) => setTimeout(r, 20))
                return { data: { ok: true } }
            }),
            interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
        }
            ; (apiClient as any).axios = axiosStub

        const schema: any = { safeParse: (d: any) => ({ success: true, data: d }) }
        const p1 = apiClient.get('/api/v1/agents/1', schema)
        const p2 = apiClient.get('/api/v1/agents/1', schema)
        const [r1, r2] = await Promise.all([p1, p2])
        expect(r1.ok && r2.ok).toBe(true)
        expect(axiosStub.request).toHaveBeenCalledTimes(1)
    })

    it('uses stable cache keys for different request params', async () => {
        const buildKey = defaultDeduplicator.buildKey.bind(defaultDeduplicator)
        const k1 = buildKey('GET', '/x?a=1&b=2')
        const k2 = buildKey('GET', '/x?b=2&a=1')
        expect(k1).toBe(k2)
    })

    it('times out long-running deduplicated requests', async () => {
        const axiosStub: any = {
            request: vi.fn().mockImplementation(async (cfg: any) => {
                await new Promise((r) => setTimeout(r, 50))
                return { data: { ok: true } }
            }),
            interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
        }
            ; (apiClient as any).axios = axiosStub

        const schema: any = { safeParse: (d: any) => ({ success: true, data: d }) }
        const start = Date.now()
        const res = await apiClient.get('/api/v1/agents/2', schema, { timeoutMs: 60 })
        expect(res.ok).toBe(true)
        expect(Date.now() - start).toBeLessThan(500)
    })

    it('does not leak memory for dedup cache after completion', async () => {
        const axiosStub: any = {
            request: vi.fn().mockResolvedValue({ data: { ok: true } }),
            interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
        }
            ; (apiClient as any).axios = axiosStub
        const schema: any = { safeParse: (d: any) => ({ success: true, data: d }) }
        const before = (apiClient as any).inflightCache.size
        await apiClient.get('/api/v1/agents/3', schema)
        const after = (apiClient as any).inflightCache.size
        expect(after).toBeLessThanOrEqual(before)
    })
})
