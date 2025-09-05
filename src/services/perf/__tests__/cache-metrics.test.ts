/**
 * Unit-Tests für Cache-Performance-Metriken.
 * 
 * Testet Cache-Hit/Miss-Tracking, Tenant-Tagging und Business-Metriken-Generierung
 * mit mindestens 85% Code-Coverage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PerformanceCollector } from '../collector'

describe('Cache-Performance-Metriken', () => {
    let collector: PerformanceCollector

    beforeEach(() => {
        collector = new PerformanceCollector()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('recordCacheHit', () => {
        it('sollte Cache-Hit korrekt aufzeichnen', () => {
            // Act
            collector.recordCacheHit('agents', 'tenant-123')

            // Assert
            const metrics = collector.getCacheMetrics()
            expect(metrics.hits).toBe(1)
            expect(metrics.misses).toBe(0)
            expect(metrics.missRate).toBe(0)
            expect(metrics.byType).toHaveLength(1)
            expect(metrics.byType[0]).toEqual({
                cacheType: 'agents',
                tenantId: 'tenant-123',
                hits: 1,
                misses: 0,
                hitRate: 1.0
            })
        })

        it('sollte Default-Werte verwenden wenn Parameter fehlen', () => {
            // Act
            collector.recordCacheHit()

            // Assert
            const metrics = collector.getCacheMetrics()
            expect(metrics.byType[0]).toEqual({
                cacheType: 'default',
                tenantId: undefined,
                hits: 1,
                misses: 0,
                hitRate: 1.0
            })
        })

        it('sollte mehrere Cache-Hits für gleichen Typ akkumulieren', () => {
            // Act
            collector.recordCacheHit('webhooks', 'tenant-456')
            collector.recordCacheHit('webhooks', 'tenant-456')
            collector.recordCacheHit('webhooks', 'tenant-456')

            // Assert
            const metrics = collector.getCacheMetrics()
            expect(metrics.hits).toBe(3)
            expect(metrics.byType[0]).toEqual({
                cacheType: 'webhooks',
                tenantId: 'tenant-456',
                hits: 3,
                misses: 0,
                hitRate: 1.0
            })
        })
    })

    describe('recordCacheMiss', () => {
        it('sollte Cache-Miss korrekt aufzeichnen', () => {
            // Act
            collector.recordCacheMiss('users', 'tenant-789')

            // Assert
            const metrics = collector.getCacheMetrics()
            expect(metrics.hits).toBe(0)
            expect(metrics.misses).toBe(1)
            expect(metrics.missRate).toBe(1.0)
            expect(metrics.byType).toHaveLength(1)
            expect(metrics.byType[0]).toEqual({
                cacheType: 'users',
                tenantId: 'tenant-789',
                hits: 0,
                misses: 1,
                hitRate: 0.0
            })
        })

        it('sollte Default-Werte verwenden wenn Parameter fehlen', () => {
            // Act
            collector.recordCacheMiss()

            // Assert
            const metrics = collector.getCacheMetrics()
            expect(metrics.byType[0]).toEqual({
                cacheType: 'default',
                tenantId: undefined,
                hits: 0,
                misses: 1,
                hitRate: 0.0
            })
        })
    })

    describe('getCacheMetrics', () => {
        it('sollte korrekte Gesamt-Metriken berechnen', () => {
            // Arrange
            collector.recordCacheHit('agents')
            collector.recordCacheHit('agents')
            collector.recordCacheMiss('agents')
            collector.recordCacheHit('webhooks')
            collector.recordCacheMiss('webhooks')
            collector.recordCacheMiss('webhooks')

            // Act
            const metrics = collector.getCacheMetrics()

            // Assert
            expect(metrics.hits).toBe(3)
            expect(metrics.misses).toBe(3)
            expect(metrics.missRate).toBe(0.5)
        })

        it('sollte verschiedene Cache-Typen getrennt verfolgen', () => {
            // Arrange
            collector.recordCacheHit('agents', 'tenant-1')
            collector.recordCacheMiss('agents', 'tenant-1')
            collector.recordCacheHit('webhooks', 'tenant-2')
            collector.recordCacheHit('users', 'tenant-1')

            // Act
            const metrics = collector.getCacheMetrics()

            // Assert
            expect(metrics.byType).toHaveLength(3)
            
            const agentsMetric = metrics.byType.find(m => m.cacheType === 'agents')
            expect(agentsMetric).toEqual({
                cacheType: 'agents',
                tenantId: 'tenant-1',
                hits: 1,
                misses: 1,
                hitRate: 0.5
            })

            const webhooksMetric = metrics.byType.find(m => m.cacheType === 'webhooks')
            expect(webhooksMetric).toEqual({
                cacheType: 'webhooks',
                tenantId: 'tenant-2',
                hits: 1,
                misses: 0,
                hitRate: 1.0
            })

            const usersMetric = metrics.byType.find(m => m.cacheType === 'users')
            expect(usersMetric).toEqual({
                cacheType: 'users',
                tenantId: 'tenant-1',
                hits: 1,
                misses: 0,
                hitRate: 1.0
            })
        })

        it('sollte verschiedene Tenants getrennt verfolgen', () => {
            // Arrange
            collector.recordCacheHit('agents', 'tenant-1')
            collector.recordCacheHit('agents', 'tenant-2')
            collector.recordCacheMiss('agents', 'tenant-1')

            // Act
            const metrics = collector.getCacheMetrics()

            // Assert
            expect(metrics.byType).toHaveLength(2)
            
            const tenant1Metric = metrics.byType.find(m => m.tenantId === 'tenant-1')
            expect(tenant1Metric).toEqual({
                cacheType: 'agents',
                tenantId: 'tenant-1',
                hits: 1,
                misses: 1,
                hitRate: 0.5
            })

            const tenant2Metric = metrics.byType.find(m => m.tenantId === 'tenant-2')
            expect(tenant2Metric).toEqual({
                cacheType: 'agents',
                tenantId: 'tenant-2',
                hits: 1,
                misses: 0,
                hitRate: 1.0
            })
        })

        it('sollte korrekte Hit-Rate bei null Requests berechnen', () => {
            // Act
            const metrics = collector.getCacheMetrics()

            // Assert
            expect(metrics.hits).toBe(0)
            expect(metrics.misses).toBe(0)
            expect(metrics.missRate).toBe(0)
            expect(metrics.byType).toHaveLength(0)
        })

        it('sollte Edge-Case mit nur Hits handhaben', () => {
            // Arrange
            collector.recordCacheHit('test')
            collector.recordCacheHit('test')

            // Act
            const metrics = collector.getCacheMetrics()

            // Assert
            expect(metrics.missRate).toBe(0)
            expect(metrics.byType[0].hitRate).toBe(1.0)
        })

        it('sollte Edge-Case mit nur Misses handhaben', () => {
            // Arrange
            collector.recordCacheMiss('test')
            collector.recordCacheMiss('test')

            // Act
            const metrics = collector.getCacheMetrics()

            // Assert
            expect(metrics.missRate).toBe(1.0)
            expect(metrics.byType[0].hitRate).toBe(0.0)
        })
    })

    describe('getCacheBusinessMetrics', () => {
        it('sollte Business-Metriken für Gesamt-Cache generieren', () => {
            // Arrange
            collector.recordCacheHit('agents')
            collector.recordCacheHit('agents')
            collector.recordCacheMiss('agents')

            // Act
            const businessMetrics = collector.getCacheBusinessMetrics()

            // Assert
            const hitRateMetric = businessMetrics.find(m => m.name === 'cache_hit_rate')
            expect(hitRateMetric).toEqual({
                name: 'cache_hit_rate',
                value: 66.66666666666667, // (1 - 1/3) * 100
                unit: '%',
                tags: undefined,
                timestamp: expect.any(Number)
            })

            const totalRequestsMetric = businessMetrics.find(m => m.name === 'cache_total_requests')
            expect(totalRequestsMetric).toEqual({
                name: 'cache_total_requests',
                value: 3,
                unit: 'count',
                tags: undefined,
                timestamp: expect.any(Number)
            })
        })

        it('sollte Business-Metriken pro Cache-Typ generieren', () => {
            // Arrange
            collector.recordCacheHit('agents', 'tenant-1')
            collector.recordCacheMiss('agents', 'tenant-1')
            collector.recordCacheHit('webhooks', 'tenant-2')

            // Act
            const businessMetrics = collector.getCacheBusinessMetrics()

            // Assert
            const agentsHitRateMetric = businessMetrics.find(m => 
                m.name === 'cache_hit_rate_by_type' && 
                m.tags?.cache_type === 'agents'
            )
            expect(agentsHitRateMetric).toEqual({
                name: 'cache_hit_rate_by_type',
                value: 50, // 0.5 * 100
                unit: '%',
                tags: {
                    cache_type: 'agents',
                    tenant_id: 'tenant-1'
                },
                timestamp: expect.any(Number)
            })

            const webhooksHitRateMetric = businessMetrics.find(m => 
                m.name === 'cache_hit_rate_by_type' && 
                m.tags?.cache_type === 'webhooks'
            )
            expect(webhooksHitRateMetric).toEqual({
                name: 'cache_hit_rate_by_type',
                value: 100, // 1.0 * 100
                unit: '%',
                tags: {
                    cache_type: 'webhooks',
                    tenant_id: 'tenant-2'
                },
                timestamp: expect.any(Number)
            })
        })

        it('sollte Tags ohne tenant_id generieren wenn nicht vorhanden', () => {
            // Arrange
            collector.recordCacheHit('default')

            // Act
            const businessMetrics = collector.getCacheBusinessMetrics()

            // Assert
            const typeMetric = businessMetrics.find(m => m.name === 'cache_hit_rate_by_type')
            expect(typeMetric?.tags).toEqual({
                cache_type: 'default'
            })
        })

        it('sollte leere Metriken bei null Cache-Aktivität zurückgeben', () => {
            // Act
            const businessMetrics = collector.getCacheBusinessMetrics()

            // Assert
            expect(businessMetrics).toHaveLength(2) // Nur Gesamt-Metriken
            expect(businessMetrics[0]).toEqual({
                name: 'cache_hit_rate',
                value: 0,
                unit: '%',
                tags: undefined,
                timestamp: expect.any(Number)
            })
            expect(businessMetrics[1]).toEqual({
                name: 'cache_total_requests',
                value: 0,
                unit: 'count',
                tags: undefined,
                timestamp: expect.any(Number)
            })
        })
    })

    describe('Integration-Tests', () => {
        it('sollte komplexes Szenario mit mehreren Typen und Tenants handhaben', () => {
            // Arrange - Simuliere reale Cache-Nutzung
            // Agents Cache für Tenant 1
            collector.recordCacheHit('agents', 'tenant-1')
            collector.recordCacheHit('agents', 'tenant-1')
            collector.recordCacheMiss('agents', 'tenant-1')
            
            // Webhooks Cache für Tenant 2
            collector.recordCacheHit('webhooks', 'tenant-2')
            collector.recordCacheMiss('webhooks', 'tenant-2')
            collector.recordCacheMiss('webhooks', 'tenant-2')
            
            // Default Cache ohne Tenant
            collector.recordCacheHit('default')

            // Act
            const metrics = collector.getCacheMetrics()
            const businessMetrics = collector.getCacheBusinessMetrics()

            // Assert - Gesamt-Metriken
            expect(metrics.hits).toBe(4)
            expect(metrics.misses).toBe(3)
            expect(metrics.missRate).toBeCloseTo(3/7, 5)

            // Assert - Pro-Typ Metriken
            expect(metrics.byType).toHaveLength(3)

            // Assert - Business-Metriken enthalten alle erwarteten Einträge
            expect(businessMetrics).toHaveLength(8) // 2 Gesamt + 6 Pro-Typ (2 pro Cache-Typ)
            
            const totalHitRate = businessMetrics.find(m => m.name === 'cache_hit_rate')
            expect(totalHitRate?.value).toBeCloseTo((1 - 3/7) * 100, 5)
        })
    })
})
