import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { BusinessMetric, PerformanceSnapshot, WebVital } from '@/types/perf'
import { PerformanceCollector } from '@/services/perf/collector'
import { apiClient } from '@/api/client'
import { z } from 'zod'

interface PerfState {
    sessionId: string
    snapshot: PerformanceSnapshot
    collector: PerformanceCollector
    initialize: (ctx?: Partial<PerformanceSnapshot['context']>) => void
    addWebVital: (v: WebVital) => void
    addBusinessMetric: (m: BusinessMetric) => void
    tick: () => void
    pushToBackend: () => Promise<void>
}

const emptySnapshot = (sessionId: string): PerformanceSnapshot => ({
    webVitals: {},
    navigation: undefined,
    resources: [],
    memory: undefined,
    network: undefined,
    business: [],
    errorsPerMinute: 0,
    crashes: 0,
    featureUsage: {},
    context: {},
    session: { id: sessionId, startedAt: Date.now(), durationMs: 0 },
})

export const usePerfStore = create<PerfState>()(
    immer((set, get) => ({
        sessionId: crypto.randomUUID(),
        snapshot: emptySnapshot(crypto.randomUUID()),
        collector: new PerformanceCollector(),

        initialize: (ctx) => {
            const c = get().collector
            const sid = c.getSessionId()
            set((s) => { s.sessionId = sid; s.snapshot = emptySnapshot(sid) })
            c.observeWebVitals(get().addWebVital)
            set((s) => {
                s.snapshot.navigation = c.getNavigationMetrics()
                s.snapshot.resources = c.getResourceMetrics(200)
                s.snapshot.memory = c.getMemoryMetrics()
                s.snapshot.network = c.getNetworkQuality()
                s.snapshot.context = {
                    userId: ctx?.userId,
                    userType: ctx?.userType,
                    sessionId: sid,
                    browser: navigator.userAgent,
                    device: (navigator as any).userAgentData?.mobile ? 'mobile' : 'desktop',
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight,
                }
            })
        },

        addWebVital: (v) => set((s) => { s.snapshot.webVitals[v.name] = v }),
        addBusinessMetric: (m) => set((s) => { s.snapshot.business.push(m) }),

        tick: () => {
            const c = get().collector
            set((s) => {
                s.snapshot.session.durationMs = Date.now() - s.snapshot.session.startedAt
                s.snapshot.memory = c.getMemoryMetrics() || s.snapshot.memory
                s.snapshot.network = c.getNetworkQuality() || s.snapshot.network
                const cm = c.getCacheMetrics()
                if (cm.missRate > 0.8) {
                    s.snapshot.business.push(c.measureBusinessMetric('cache_miss_rate', Math.round(cm.missRate * 100), '%'))
                }
            })
        },

        pushToBackend: async () => {
            const state = get()
            const cacheMetrics = state.collector.getCacheMetrics()
            const cacheBusinessMetrics = state.collector.getCacheBusinessMetrics()

            // Erweitere Snapshot um Cache-Metriken
            const enhancedSnapshot = {
                ...state.snapshot,
                cache_metrics: {
                    hits: cacheMetrics.hits,
                    misses: cacheMetrics.misses,
                    miss_rate: cacheMetrics.missRate,
                    by_type: cacheMetrics.byType.map(typeMetric => ({
                        cache_type: typeMetric.cacheType,
                        tenant_id: typeMetric.tenantId,
                        hits: typeMetric.hits,
                        misses: typeMetric.misses,
                        hit_rate: typeMetric.hitRate
                    }))
                },
                business: [
                    ...state.snapshot.business,
                    ...cacheBusinessMetrics
                ]
            }

            await apiClient.post('/api/v1/metrics/client', z.any(), {
                body: enhancedSnapshot,
                headers: { 'X-Tenant-Id': 'default' }
            })
        },
    })),
)
