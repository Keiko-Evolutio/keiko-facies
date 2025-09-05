import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { KeikoAPIClient } from '@/api/client'
import { z } from 'zod'

vi.mock('axios')

describe('KeikoAPIClient retry + circuit breaker', () => {
    const okSchema = z.object({ ok: z.boolean() })
    let client: KeikoAPIClient

    beforeEach(() => {
        vi.clearAllMocks()
        // @ts-ignore
        axios.create = vi.fn(() => ({
            interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
            request: vi.fn(),
        }))
        // @ts-ignore
        client = new (KeikoAPIClient as any)('http://test')
    })

    it('retries on 5xx and succeeds', async () => {
        const instance: any = (client as any).axios
        instance.request
            .mockRejectedValueOnce({ response: { status: 502 }, message: 'Bad Gateway' })
            .mockRejectedValueOnce({ response: { status: 503 }, message: 'Service Unavailable' })
            .mockResolvedValueOnce({ data: { ok: true } })

        const res = await client.get('/health', okSchema, { retries: 2 })
        expect(res.ok).toBe(true)
        if (res.ok) expect(res.data.ok).toBe(true)
        expect(instance.request).toHaveBeenCalledTimes(3)
    })

    it('stops retrying on 4xx', async () => {
        const instance: any = (client as any).axios
        instance.request.mockRejectedValueOnce({ response: { status: 400 }, message: 'Bad Request' })

        const res = await client.get('/health', okSchema, { retries: 3 })
        expect(res.ok).toBe(false)
        expect(instance.request).toHaveBeenCalledTimes(1)
    })
})
