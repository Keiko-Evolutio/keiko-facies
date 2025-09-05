import { v4 as uuidv4 } from 'uuid'
import type {
    BusinessMetric,
    MemoryMetrics,
    NavigationMetrics,
    NetworkQualityMetrics,
    ResourceMetric,
    WebVital,
    WebVitalName,
} from '@/types/perf'

/**
 * Erfasst client-seitige Performance-Metriken (Web Vitals, Timing APIs, Memory/Netzwerk).
 */
export class PerformanceCollector {
    private sessionId: string
    private cacheHits = 0
    private cacheMisses = 0
    private cacheMetricsByType: Map<string, { hits: number; misses: number; tenantId?: string }> = new Map()

    constructor() {
        this.sessionId = uuidv4()
    }

    getSessionId(): string { return this.sessionId }

    /**
     * Zeichnet Cache-Hit auf mit optionalen Tags.
     */
    recordCacheHit(cacheType: string = 'default', tenantId?: string): void {
        this.cacheHits++

        const key = `${cacheType}:${tenantId || 'default'}`
        const existing = this.cacheMetricsByType.get(key) || { hits: 0, misses: 0, tenantId }
        existing.hits++
        this.cacheMetricsByType.set(key, existing)
    }

    /**
     * Zeichnet Cache-Miss auf mit optionalen Tags.
     */
    recordCacheMiss(cacheType: string = 'default', tenantId?: string): void {
        this.cacheMisses++

        const key = `${cacheType}:${tenantId || 'default'}`
        const existing = this.cacheMetricsByType.get(key) || { hits: 0, misses: 0, tenantId }
        existing.misses++
        this.cacheMetricsByType.set(key, existing)
    }

    // Core Web Vitals via PerformanceObserver (ohne externe Libs)
    observeWebVitals(onMetric: (metric: WebVital) => void): void {
        const map: Record<string, WebVitalName> = { 'largest-contentful-paint': 'LCP', 'first-input': 'FID', 'layout-shift': 'CLS', 'event': 'INP' }

        try {
            const po = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.entryType === 'largest-contentful-paint') {
                        const m: WebVital = { name: 'LCP', value: (entry as any).renderTime || entry.startTime, timestamp: performance.now(), entries: [entry] }
                        onMetric(m)
                    } else if (entry.entryType === 'first-input') {
                        const m: WebVital = { name: 'FID', value: (entry as any).processingStart - entry.startTime, timestamp: performance.now(), entries: [entry] }
                        onMetric(m)
                    } else if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
                        const m: WebVital = { name: 'CLS', value: (entry as any).value || 0, timestamp: performance.now(), entries: [entry] }
                        onMetric(m)
                    }
                })
            })
            po.observe({ type: 'largest-contentful-paint', buffered: true } as any)
            po.observe({ type: 'first-input', buffered: true } as any)
            po.observe({ type: 'layout-shift', buffered: true } as any)
        } catch (_) { /* ältere Browser */ }
    }

    getNavigationMetrics(): NavigationMetrics | undefined {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
        if (!nav) return undefined
        const paint = performance.getEntriesByType('paint') as PerformanceEntry[]
        const fp = paint.find((p) => p.name === 'first-paint')?.startTime
        const fcp = paint.find((p) => p.name === 'first-contentful-paint')?.startTime
        return {
            startTime: nav.startTime,
            domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
            loadEventEnd: nav.loadEventEnd - nav.startTime,
            firstPaint: fp,
            firstContentfulPaint: fcp,
            transferSize: (nav as any).transferSize,
        }
    }

    getResourceMetrics(limit = 200): ResourceMetric[] {
        const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
        return res.slice(0, limit).map((r) => ({
            name: r.name,
            initiatorType: r.initiatorType,
            duration: r.duration,
            transferSize: (r as any).transferSize,
            startTime: r.startTime,
        }))
    }

    getMemoryMetrics(): MemoryMetrics | undefined {
        const m = (performance as any).memory
        if (!m) return undefined
        return { usedJSHeapSize: m.usedJSHeapSize, totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit, timestamp: Date.now() }
    }

    getNetworkQuality(): NetworkQualityMetrics | undefined {
        const c = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
        if (!c) return { timestamp: Date.now() }
        return { effectiveType: c.effectiveType, rtt: c.rtt, downlink: c.downlink, saveData: !!c.saveData, timestamp: Date.now() }
    }

    measureBusinessMetric(name: string, value: number, unit?: string, tags?: Record<string, string>): BusinessMetric {
        return { name, value, unit, tags, timestamp: Date.now() }
    }

    /**
     * Holt erweiterte Cache-Metriken mit Typ- und Tenant-Aufschlüsselung.
     */
    getCacheMetrics(): {
        hits: number;
        misses: number;
        missRate: number;
        byType: Array<{
            cacheType: string;
            tenantId?: string;
            hits: number;
            misses: number;
            hitRate: number
        }>
    } {
        const total = this.cacheHits + this.cacheMisses
        const missRate = total ? (this.cacheMisses / total) : 0

        const byType = Array.from(this.cacheMetricsByType.entries()).map(([key, metrics]) => {
            const [cacheType, tenantId] = key.split(':')
            const typeTotal = metrics.hits + metrics.misses
            const hitRate = typeTotal ? (metrics.hits / typeTotal) : 0

            return {
                cacheType,
                tenantId: tenantId !== 'default' ? tenantId : undefined,
                hits: metrics.hits,
                misses: metrics.misses,
                hitRate
            }
        })

        return {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            missRate,
            byType
        }
    }

    /**
     * Erstellt Business-Metriken für Cache-Performance.
     */
    getCacheBusinessMetrics(): BusinessMetric[] {
        const metrics = this.getCacheMetrics()
        const businessMetrics: BusinessMetric[] = []

        // Gesamt-Cache-Metriken
        businessMetrics.push(
            this.measureBusinessMetric('cache_hit_rate', (1 - metrics.missRate) * 100, '%'),
            this.measureBusinessMetric('cache_total_requests', metrics.hits + metrics.misses, 'count')
        )

        // Pro Cache-Typ Metriken
        metrics.byType.forEach(typeMetric => {
            const tags = {
                cache_type: typeMetric.cacheType,
                ...(typeMetric.tenantId ? { tenant_id: typeMetric.tenantId } : {})
            }

            businessMetrics.push(
                this.measureBusinessMetric('cache_hit_rate_by_type', typeMetric.hitRate * 100, '%', tags),
                this.measureBusinessMetric('cache_requests_by_type', typeMetric.hits + typeMetric.misses, 'count', tags)
            )
        })

        return businessMetrics
    }
}
