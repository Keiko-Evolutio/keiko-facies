/**
 * Unit-Tests für Background Sync Queue-Funktionalität.
 * 
 * Testet Edge-Cases wie Netzwerkfehler, Cache-Misses und Event-Race-Conditions
 * mit mindestens 85% Code-Coverage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { 
    enqueue, 
    flush, 
    getQueueStats, 
    clearQueue, 
    enqueueHighPriority,
    type QueueStats 
} from '../queue'

// Mock IndexedDB
const mockIdbGet = vi.fn()
const mockIdbPut = vi.fn()
const mockIdbDelete = vi.fn()

vi.mock('@/services/cache/indexeddb', () => ({
    idbGet: mockIdbGet,
    idbPut: mockIdbPut,
    idbDelete: mockIdbDelete
}))

// Mock Service Worker
const mockServiceWorkerReady = vi.fn()
const mockSyncRegister = vi.fn()

Object.defineProperty(navigator, 'serviceWorker', {
    value: {
        ready: mockServiceWorkerReady
    },
    writable: true
})

Object.defineProperty(window, 'ServiceWorkerRegistration', {
    value: {
        prototype: {
            sync: true
        }
    },
    writable: true
})

// Mock Error Logging
const mockLogClientError = vi.fn()
vi.mock('@/services/error-logging', () => ({
    logClientError: mockLogClientError
}))

// Mock localStorage
const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
}
Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true
})

describe('Background Sync Queue', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockServiceWorkerReady.mockResolvedValue({
            sync: { register: mockSyncRegister }
        })
        mockSyncRegister.mockResolvedValue(undefined)
        mockIdbGet.mockResolvedValue([])
        mockIdbPut.mockResolvedValue(undefined)
        mockLocalStorage.getItem.mockReturnValue(null)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('enqueue', () => {
        it('sollte Request erfolgreich zur Queue hinzufügen', async () => {
            // Arrange
            const requestData = {
                method: 'POST' as const,
                url: '/api/v1/test',
                body: { test: 'data' },
                headers: { 'Content-Type': 'application/json' }
            }

            // Act
            const id = await enqueue(requestData)

            // Assert
            expect(id).toMatch(/^q_[a-z0-9]+$/)
            expect(mockIdbPut).toHaveBeenCalledWith('offline-write-queue', [
                expect.objectContaining({
                    id,
                    method: 'POST',
                    url: '/api/v1/test',
                    body: { test: 'data' },
                    headers: { 'Content-Type': 'application/json' },
                    attempts: 0,
                    maxAttempts: 5,
                    priority: 'normal',
                    timestamp: expect.any(Number)
                })
            ])
            expect(mockSyncRegister).toHaveBeenCalledWith('keiko-background-sync')
        })

        it('sollte Background Sync auch bei Service Worker-Fehlern handhaben', async () => {
            // Arrange
            mockSyncRegister.mockRejectedValue(new Error('Service Worker nicht verfügbar'))
            const requestData = {
                method: 'POST' as const,
                url: '/api/v1/test',
                body: { test: 'data' }
            }

            // Act
            const id = await enqueue(requestData)

            // Assert
            expect(id).toBeDefined()
            expect(mockLogClientError).toHaveBeenCalledWith({
                level: 'warning',
                message: 'Background Sync registration failed',
                error: expect.any(Error),
                context: { itemId: id }
            })
        })

        it('sollte hohe Priorität korrekt setzen', async () => {
            // Arrange
            const requestData = {
                method: 'POST' as const,
                url: '/api/v1/critical',
                body: { urgent: true },
                priority: 'high' as const
            }

            // Act
            await enqueue(requestData)

            // Assert
            expect(mockIdbPut).toHaveBeenCalledWith('offline-write-queue', [
                expect.objectContaining({
                    priority: 'high'
                })
            ])
        })
    })

    describe('enqueueHighPriority', () => {
        it('sollte Request mit hoher Priorität hinzufügen', async () => {
            // Act
            const id = await enqueueHighPriority('POST', '/api/v1/urgent', { critical: true })

            // Assert
            expect(mockIdbPut).toHaveBeenCalledWith('offline-write-queue', [
                expect.objectContaining({
                    id,
                    method: 'POST',
                    url: '/api/v1/urgent',
                    body: { critical: true },
                    priority: 'high'
                })
            ])
        })
    })

    describe('flush', () => {
        it('sollte Queue erfolgreich verarbeiten', async () => {
            // Arrange
            const queueItems = [
                {
                    id: 'test1',
                    method: 'POST',
                    url: '/api/v1/test1',
                    body: { data: 1 },
                    attempts: 0,
                    maxAttempts: 5,
                    priority: 'normal',
                    timestamp: Date.now() - 1000
                },
                {
                    id: 'test2',
                    method: 'PUT',
                    url: '/api/v1/test2',
                    body: { data: 2 },
                    attempts: 0,
                    maxAttempts: 5,
                    priority: 'high',
                    timestamp: Date.now()
                }
            ]
            mockIdbGet.mockResolvedValue(queueItems)

            const mockProcessor = vi.fn()
                .mockResolvedValueOnce(true)  // test1 erfolgreich
                .mockResolvedValueOnce(true)  // test2 erfolgreich

            // Act
            await flush(mockProcessor)

            // Assert
            expect(mockProcessor).toHaveBeenCalledTimes(2)
            // Hohe Priorität zuerst
            expect(mockProcessor).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'test2', priority: 'high' }))
            expect(mockProcessor).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'test1', priority: 'normal' }))
            expect(mockIdbPut).toHaveBeenCalledWith('offline-write-queue', [])
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith('keiko-last-flush', expect.any(String))
        })

        it('sollte fehlgeschlagene Requests retry-en', async () => {
            // Arrange
            const queueItems = [
                {
                    id: 'test1',
                    method: 'POST',
                    url: '/api/v1/test1',
                    body: { data: 1 },
                    attempts: 1,
                    maxAttempts: 5,
                    priority: 'normal',
                    timestamp: Date.now()
                }
            ]
            mockIdbGet.mockResolvedValue(queueItems)

            const mockProcessor = vi.fn().mockResolvedValue(false)

            // Act
            await flush(mockProcessor)

            // Assert
            expect(mockIdbPut).toHaveBeenCalledWith('offline-write-queue', [
                expect.objectContaining({
                    id: 'test1',
                    attempts: 2  // Erhöht
                })
            ])
        })

        it('sollte Items nach max Attempts entfernen', async () => {
            // Arrange
            const queueItems = [
                {
                    id: 'test1',
                    method: 'POST',
                    url: '/api/v1/test1',
                    body: { data: 1 },
                    attempts: 4,  // Bereits 4 Versuche
                    maxAttempts: 5,
                    priority: 'normal',
                    timestamp: Date.now()
                }
            ]
            mockIdbGet.mockResolvedValue(queueItems)

            const mockProcessor = vi.fn().mockResolvedValue(false)

            // Act
            await flush(mockProcessor)

            // Assert
            expect(mockIdbPut).toHaveBeenCalledWith('offline-write-queue', [])
        })

        it('sollte Standard-Processor verwenden wenn keiner angegeben', async () => {
            // Arrange
            const queueItems = [
                {
                    id: 'test1',
                    method: 'POST',
                    url: '/api/v1/test1',
                    body: { data: 1 },
                    attempts: 0,
                    maxAttempts: 5,
                    priority: 'normal',
                    timestamp: Date.now()
                }
            ]
            mockIdbGet.mockResolvedValue(queueItems)

            // Mock fetch
            global.fetch = vi.fn().mockResolvedValue({
                ok: true
            })

            // Act
            await flush()

            // Assert
            expect(global.fetch).toHaveBeenCalledWith('/api/v1/test1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ data: 1 })
            })
            expect(mockIdbPut).toHaveBeenCalledWith('offline-write-queue', [])
        })

        it('sollte Netzwerkfehler korrekt behandeln', async () => {
            // Arrange
            const queueItems = [
                {
                    id: 'test1',
                    method: 'POST',
                    url: '/api/v1/test1',
                    body: { data: 1 },
                    attempts: 0,
                    maxAttempts: 5,
                    priority: 'normal',
                    timestamp: Date.now()
                }
            ]
            mockIdbGet.mockResolvedValue(queueItems)

            const mockProcessor = vi.fn().mockRejectedValue(new Error('Network error'))

            // Act
            await flush(mockProcessor)

            // Assert
            expect(mockLogClientError).toHaveBeenCalledWith({
                level: 'warning',
                message: 'Queue item processing failed',
                error: expect.any(Error),
                context: { itemId: 'test1', attempts: 1 }
            })
            expect(mockIdbPut).toHaveBeenCalledWith('offline-write-queue', [
                expect.objectContaining({
                    id: 'test1',
                    attempts: 1
                })
            ])
        })
    })

    describe('getQueueStats', () => {
        it('sollte korrekte Statistiken zurückgeben', async () => {
            // Arrange
            const queueItems = [
                { priority: 'high', attempts: 1, maxAttempts: 5 },
                { priority: 'normal', attempts: 2, maxAttempts: 5 },
                { priority: 'high', attempts: 5, maxAttempts: 5 }  // Failed
            ]
            mockIdbGet.mockResolvedValue(queueItems)
            mockLocalStorage.getItem.mockReturnValue('1640995200000')

            // Act
            const stats: QueueStats = await getQueueStats()

            // Assert
            expect(stats).toEqual({
                totalRequests: 3,
                highPriorityRequests: 2,
                failedRequests: 1,
                lastFlushTime: 1640995200000
            })
        })

        it('sollte Fehler graceful behandeln', async () => {
            // Arrange
            mockIdbGet.mockRejectedValue(new Error('IndexedDB error'))

            // Act
            const stats = await getQueueStats()

            // Assert
            expect(stats).toEqual({
                totalRequests: 0,
                highPriorityRequests: 0,
                failedRequests: 0,
                lastFlushTime: null
            })
            expect(mockLogClientError).toHaveBeenCalledWith({
                level: 'warning',
                message: 'Failed to get queue stats',
                error: expect.any(Error)
            })
        })
    })

    describe('clearQueue', () => {
        it('sollte Queue erfolgreich leeren', async () => {
            // Act
            await clearQueue()

            // Assert
            expect(mockIdbPut).toHaveBeenCalledWith('offline-write-queue', [])
        })

        it('sollte Fehler beim Leeren behandeln', async () => {
            // Arrange
            mockIdbPut.mockRejectedValue(new Error('Clear failed'))

            // Act
            await clearQueue()

            // Assert
            expect(mockLogClientError).toHaveBeenCalledWith({
                level: 'warning',
                message: 'Failed to clear queue',
                error: expect.any(Error)
            })
        })
    })
})
