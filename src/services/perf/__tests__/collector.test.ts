import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PerformanceCollector } from '@/services/perf/collector'

// Deutsche Kommentare: Mockt Browser Performance APIs deterministisch

const mockNow = 1000

describe('PerformanceCollector', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(global.Date, 'now').mockReturnValue(mockNow)
            ; (globalThis as any).performance = {
                now: vi.fn(() => 123.456),
                getEntriesByType: vi.fn((type: string) => {
                    if (type === 'navigation') {
                        return [{ startTime: 0, domContentLoadedEventEnd: 1200, loadEventEnd: 2000, transferSize: 102400 }] as any
                    }
                    if (type === 'paint') {
                        return [{ name: 'first-paint', startTime: 500 }, { name: 'first-contentful-paint', startTime: 700 }] as any
                    }
                    if (type === 'resource') {
                        return [{ name: 'res.js', initiatorType: 'script', duration: 50.2, transferSize: 2048, startTime: 100 }] as any
                    }
                    return []
                }),
                memory: { usedJSHeapSize: 10_000_000, totalJSHeapSize: 30_000_000, jsHeapSizeLimit: 100_000_000 },
            } as any
    })

    it('collects web vitals via PerformanceObserver where supported', () => {
        const callbacks: any[] = []
            ; (globalThis as any).PerformanceObserver = class {
                constructor(cb: any) { callbacks.push(cb) }
                observe() { }
                disconnect() { }
            }
        const collector = new PerformanceCollector()
        const metrics: any[] = []
        collector.observeWebVitals((m) => metrics.push(m))

        // Simuliere LCP, FID, CLS Events
        const entryList = {
            getEntries: () => [
                { entryType: 'largest-contentful-paint', renderTime: 1800, startTime: 1800 },
                { entryType: 'first-input', processingStart: 1900, startTime: 1850 },
                { entryType: 'layout-shift', value: 0.11, hadRecentInput: false },
            ],
        }
        callbacks.forEach((cb) => cb(entryList))

        expect(metrics.find((m) => m.name === 'LCP')!.value).toBe(1800)
        expect(Math.round(metrics.find((m) => m.name === 'FID')!.value)).toBe(50)
        expect(metrics.find((m) => m.name === 'CLS')!.value).toBe(0.11)
    })

    it('provides navigation/resource/memory/network metrics with expected shapes', () => {
        ; (navigator as any).connection = { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false }
        const collector = new PerformanceCollector()
        const nav = collector.getNavigationMetrics()!
        const res = collector.getResourceMetrics(10)
        const mem = collector.getMemoryMetrics()!
        const net = collector.getNetworkQuality()!
        expect(Math.round(nav.domContentLoaded)).toBe(1200)
        expect(res[0].initiatorType).toBe('script')
        expect(mem.usedJSHeapSize).toBeGreaterThan(0)
        expect(net.effectiveType).toBe('4g')
    })

    it('handles unavailable APIs gracefully', () => {
        ; (globalThis as any).performance = { getEntriesByType: vi.fn(() => []) }
        const collector = new PerformanceCollector()
        expect(collector.getNavigationMetrics()).toBeUndefined()
        expect(collector.getMemoryMetrics()).toBeUndefined()
        const net = collector.getNetworkQuality()
        expect(net).toBeDefined()
    })
})
