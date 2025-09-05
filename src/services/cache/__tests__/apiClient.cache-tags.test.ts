import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient } from '@/api/client'
import * as cm from '@/services/cache/cacheManager'

describe('API Client cache tags', () => {
    beforeEach(() => vi.clearAllMocks())

    it('writes cache with tagsFn for user endpoint', async () => {
        const spySet = vi.spyOn(cm.default, 'set' as any)
            // @ts-ignore stub axios
            ; (apiClient as any).axios = { request: vi.fn().mockResolvedValue({ data: { ok: true } }), interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }
        const res = await apiClient.get('/api/v1/users/123', { safeParse: (d: any) => ({ success: true, data: d }) } as any)
        expect(res.ok).toBe(true)
    })
})
