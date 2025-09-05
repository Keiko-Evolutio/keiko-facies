import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePerfStore } from '@/store/perf'

describe('perf store', () => {
    beforeEach(() => vi.clearAllMocks())

    it('initializes snapshot with context and collects vitals', () => {
        const { initialize, snapshot, addWebVital } = usePerfStore.getState()
        initialize({ userId: 'u1', userType: 'admin' })
        addWebVital({ name: 'LCP', value: 1200, timestamp: Date.now() }) as any
        const s = usePerfStore.getState().snapshot
        expect(s.context?.userId).toBe('u1')
        expect(s.webVitals['LCP']?.value).toBe(1200)
    })

    it('handles large business metric volumes without crash', () => {
        const { initialize, addBusinessMetric } = usePerfStore.getState()
        initialize()
        for (let i = 0; i < 12_000; i++) {
            addBusinessMetric({ name: 'agent_response_time', value: i, timestamp: Date.now() })
        }
        const s = usePerfStore.getState().snapshot
        expect(s.business.length).toBe(12000)
    })
})
