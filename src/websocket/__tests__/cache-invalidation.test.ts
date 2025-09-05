/**
 * Unit-Tests für Cache-Invalidierung basierend auf WebSocket-Events.
 * 
 * Testet die atomische Cache-Invalidierung und Event-Race-Conditions
 * mit mindestens 85% Code-Coverage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock Cache Manager
const mockInvalidateByTag = vi.fn()
const mockCacheManager = {
    invalidateByTag: mockInvalidateByTag
}

vi.mock('@/services/cache/cacheManager', () => ({
    defaultCacheManager: mockCacheManager
}))

// Mock Offline Queue
const mockFlush = vi.fn()
vi.mock('@/services/offline/queue', () => ({
    flush: mockFlush
}))

// Import nach Mocks
import { useWebSocketStore } from '../manager'

describe('Cache-Invalidierung bei WebSocket-Events', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockInvalidateByTag.mockResolvedValue(undefined)
        mockFlush.mockResolvedValue(undefined)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('agent_status_changed Event', () => {
        it('sollte agents Cache invalidieren', async () => {
            // Arrange
            const event = {
                event_type: 'agent_status_changed',
                agent_id: 'agent-123',
                status: 'active'
            }

            // Act
            // Simuliere Event-Handling durch direkten Aufruf der handleCacheInvalidation Funktion
            // Da die Funktion privat ist, testen wir über das Store-Interface
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(mockInvalidateByTag).toHaveBeenCalledWith('agents')
        })

        it('sollte user-spezifischen Cache invalidieren wenn user_id vorhanden', async () => {
            // Arrange
            const event = {
                event_type: 'agent_status_changed',
                agent_id: 'agent-123',
                user_id: 'user-456',
                status: 'inactive'
            }

            // Act
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(mockInvalidateByTag).toHaveBeenCalledWith('agents')
            expect(mockInvalidateByTag).toHaveBeenCalledWith('user:user-456')
        })

        it('sollte nur agents Cache invalidieren wenn user_id fehlt', async () => {
            // Arrange
            const event = {
                event_type: 'agent_status_changed',
                agent_id: 'agent-123',
                status: 'error'
            }

            // Act
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(mockInvalidateByTag).toHaveBeenCalledWith('agents')
            expect(mockInvalidateByTag).not.toHaveBeenCalledWith(expect.stringMatching(/^user:/))
        })

        it('sollte atomische Invalidierung durchführen', async () => {
            // Arrange
            const event = {
                event_type: 'agent_status_changed',
                agent_id: 'agent-123',
                user_id: 'user-456',
                status: 'active'
            }

            let invalidationOrder: string[] = []
            mockInvalidateByTag.mockImplementation((tag: string) => {
                invalidationOrder.push(tag)
                return Promise.resolve()
            })

            // Act
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(invalidationOrder).toContain('agents')
            expect(invalidationOrder).toContain('user:user-456')
            expect(mockInvalidateByTag).toHaveBeenCalledTimes(2)
        })

        it('sollte Fehler bei Cache-Invalidierung nicht eskalieren', async () => {
            // Arrange
            const event = {
                event_type: 'agent_status_changed',
                agent_id: 'agent-123',
                user_id: 'user-456',
                status: 'active'
            }

            mockInvalidateByTag.mockRejectedValue(new Error('Cache invalidation failed'))
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

            // Act & Assert - sollte nicht werfen
            const store = useWebSocketStore.getState()
            await expect(store.addRecentEvent(event)).resolves.not.toThrow()

            // Assert
            expect(consoleSpy).toHaveBeenCalledWith(
                '[WebSocket] Cache invalidation failed:',
                expect.any(Error)
            )

            consoleSpy.mockRestore()
        })
    })

    describe('target_status_changed Event', () => {
        it('sollte webhooks Cache invalidieren', async () => {
            // Arrange
            const event = {
                event_type: 'target_status_changed',
                target_id: 'target-123',
                status: 'enabled'
            }

            // Act
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(mockInvalidateByTag).toHaveBeenCalledWith('webhooks')
            expect(mockInvalidateByTag).toHaveBeenCalledTimes(1)
        })
    })

    describe('webhook_delivered Event', () => {
        it('sollte webhooks Cache invalidieren', async () => {
            // Arrange
            const event = {
                event_type: 'webhook_delivered',
                delivery_id: 'delivery-123',
                target_id: 'target-456',
                status: 'success'
            }

            // Act
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(mockInvalidateByTag).toHaveBeenCalledWith('webhooks')
            expect(mockInvalidateByTag).toHaveBeenCalledTimes(1)
        })
    })

    describe('Unbekannte Events', () => {
        it('sollte keine Cache-Invalidierung für unbekannte Events durchführen', async () => {
            // Arrange
            const event = {
                event_type: 'unknown_event',
                data: { some: 'data' }
            }

            // Act
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(mockInvalidateByTag).not.toHaveBeenCalled()
        })

        it('sollte keine Cache-Invalidierung für Events ohne event_type durchführen', async () => {
            // Arrange
            const event = {
                data: { some: 'data' }
            }

            // Act
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(mockInvalidateByTag).not.toHaveBeenCalled()
        })
    })

    describe('Race-Conditions', () => {
        it('sollte parallele Events korrekt behandeln', async () => {
            // Arrange
            const events = [
                { event_type: 'agent_status_changed', agent_id: 'agent-1', user_id: 'user-1' },
                { event_type: 'target_status_changed', target_id: 'target-1' },
                { event_type: 'agent_status_changed', agent_id: 'agent-2', user_id: 'user-2' }
            ]

            let invalidationCalls: string[] = []
            mockInvalidateByTag.mockImplementation((tag: string) => {
                invalidationCalls.push(tag)
                return new Promise(resolve => setTimeout(resolve, Math.random() * 10))
            })

            // Act
            const store = useWebSocketStore.getState()
            await Promise.all(events.map(event => store.addRecentEvent(event)))

            // Assert
            expect(invalidationCalls).toContain('agents')
            expect(invalidationCalls).toContain('user:user-1')
            expect(invalidationCalls).toContain('user:user-2')
            expect(invalidationCalls).toContain('webhooks')
            expect(mockInvalidateByTag).toHaveBeenCalledTimes(5) // 2x agents + 2x user + 1x webhooks
        })

        it('sollte doppelte Invalidierungen handhaben', async () => {
            // Arrange
            const events = [
                { event_type: 'agent_status_changed', agent_id: 'agent-1', user_id: 'user-1' },
                { event_type: 'agent_status_changed', agent_id: 'agent-2', user_id: 'user-1' } // Gleiche user_id
            ]

            // Act
            const store = useWebSocketStore.getState()
            await Promise.all(events.map(event => store.addRecentEvent(event)))

            // Assert
            expect(mockInvalidateByTag).toHaveBeenCalledWith('agents')
            expect(mockInvalidateByTag).toHaveBeenCalledWith('user:user-1')
            // Sollte 4 Calls sein: 2x agents + 2x user:user-1 (auch wenn doppelt)
            expect(mockInvalidateByTag).toHaveBeenCalledTimes(4)
        })
    })

    describe('Edge-Cases', () => {
        it('sollte leere user_id korrekt behandeln', async () => {
            // Arrange
            const event = {
                event_type: 'agent_status_changed',
                agent_id: 'agent-123',
                user_id: '', // Leerer String
                status: 'active'
            }

            // Act
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(mockInvalidateByTag).toHaveBeenCalledWith('agents')
            expect(mockInvalidateByTag).not.toHaveBeenCalledWith('user:')
        })

        it('sollte null user_id korrekt behandeln', async () => {
            // Arrange
            const event = {
                event_type: 'agent_status_changed',
                agent_id: 'agent-123',
                user_id: null,
                status: 'active'
            }

            // Act
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(mockInvalidateByTag).toHaveBeenCalledWith('agents')
            expect(mockInvalidateByTag).not.toHaveBeenCalledWith(expect.stringMatching(/^user:/))
        })

        it('sollte undefined user_id korrekt behandeln', async () => {
            // Arrange
            const event = {
                event_type: 'agent_status_changed',
                agent_id: 'agent-123',
                user_id: undefined,
                status: 'active'
            }

            // Act
            const store = useWebSocketStore.getState()
            await store.addRecentEvent(event)

            // Assert
            expect(mockInvalidateByTag).toHaveBeenCalledWith('agents')
            expect(mockInvalidateByTag).not.toHaveBeenCalledWith(expect.stringMatching(/^user:/))
        })
    })
})
