import { enqueue, flush, getQueueSummary, getPendingCount } from '@/services/offline/requestQueue'

describe('offline request queue', () => {
    beforeEach(async () => {
        // Reset DB by reopening with higher version if needed; rely on fake-indexeddb clean state per test runner
    })

    it('enqueues and flushes a successful request', async () => {
        // Mock fetch success
        ; (global as any).fetch = vi.fn().mockResolvedValue({ ok: true })
        await enqueue({ url: '/api/x', method: 'POST', body: { a: 1 }, headers: {}, priority: 'normal' })
        const before = await getQueueSummary()
        expect(before.size).toBe(1)
        const res = await flush()
        expect(res.sent).toBe(1)
        const after = await getQueueSummary()
        expect(after.size).toBe(0)
    })

    it('applies exponential backoff on failure and keeps item pending', async () => {
        ; (global as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
        await enqueue({ url: '/api/y', method: 'POST', body: {}, headers: {}, priority: 'critical', maxRetries: 2 })
        const p0 = await getPendingCount()
        expect(p0).toBe(1)
        await flush()
        const p1 = await getPendingCount()
        // after backoff nextAttemptAt is in the future, thus pending count becomes 0
        expect(p1).toBe(0)
    })
})
