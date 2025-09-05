// src/types/perf.ts
// Typdefinitionen für Performance-Monitoring

export type WebVitalName = 'LCP' | 'FID' | 'CLS' | 'INP'

export interface WebVital {
    name: WebVitalName
    value: number
    rating?: 'good' | 'needs-improvement' | 'poor'
    delta?: number
    entries?: PerformanceEntry[]
    timestamp: number
}

export interface NavigationMetrics {
    startTime: number
    domContentLoaded: number
    loadEventEnd: number
    firstPaint?: number
    firstContentfulPaint?: number
    transferSize?: number
}

export interface ResourceMetric {
    name: string
    initiatorType?: string
    duration: number
    transferSize?: number
    startTime: number
}

export interface MemoryMetrics {
    usedJSHeapSize?: number
    totalJSHeapSize?: number
    jsHeapSizeLimit?: number
    timestamp: number
}

export interface NetworkQualityMetrics {
    effectiveType?: string
    rtt?: number
    downlink?: number
    saveData?: boolean
    timestamp: number
}

export interface BusinessMetric {
    name: string
    value: number
    unit?: string
    tags?: Record<string, string>
    timestamp: number
}

export interface PerformanceSnapshot {
    webVitals: Partial<Record<WebVitalName, WebVital>>
    navigation?: NavigationMetrics
    resources?: ResourceMetric[]
    memory?: MemoryMetrics
    network?: NetworkQualityMetrics
    business: BusinessMetric[]
    errorsPerMinute?: number
    crashes?: number
    featureUsage: Record<string, number>
    context?: {
        userId?: string
        userType?: string
        sessionId?: string
        browser?: string
        device?: string
        viewportWidth?: number
        viewportHeight?: number
    }
    session: {
        id: string
        startedAt: number
        durationMs: number
    }
}
