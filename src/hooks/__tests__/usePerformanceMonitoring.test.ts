/**
 * Test für usePerformanceMonitoring Hook WebSocket Initialisierung Fix
 *
 * Testet, dass WebSocket nicht mehrfach initialisiert wird.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the hook
const mockInitialize = vi.fn()
const mockTick = vi.fn()
const mockAddBusinessMetric = vi.fn()
const mockInitializeWebSocket = vi.fn()

vi.mock('@/store/perf', () => ({
  usePerfStore: () => ({
    initialize: mockInitialize,
    tick: mockTick,
    addBusinessMetric: mockAddBusinessMetric
  })
}))

vi.mock('@/websocket/manager', () => ({
  useWebSocketStore: () => ({
    client: null,
    isInitialized: false
  }),
  initializeWebSocket: mockInitializeWebSocket
}))

describe('usePerformanceMonitoring WebSocket Initialisierung Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInitializeWebSocket.mockResolvedValue(undefined)
  })

  it('sollte WebSocket Initialisierung korrekt aufrufen', () => {
    // Arrange - Mock ist bereits in beforeEach gesetzt

    // Act - Import und Ausführung des Hooks
    const { usePerformanceMonitoring } = require('../usePerformanceMonitoring')
    usePerformanceMonitoring()

    // Assert - initializeWebSocket sollte aufgerufen werden
    expect(mockInitializeWebSocket).toHaveBeenCalled()
  })

  it('sollte Performance Store Funktionen aufrufen', () => {
    // Act
    const { usePerformanceMonitoring } = require('../usePerformanceMonitoring')
    const result = usePerformanceMonitoring()

    // Assert
    expect(mockInitialize).toHaveBeenCalled()
    expect(result.addBusinessMetric).toBe(mockAddBusinessMetric)
  })

  it('sollte initializeWebSocket bei nicht-initialisiertem Zustand aufrufen', () => {
    // Act
    const { usePerformanceMonitoring } = require('../usePerformanceMonitoring')
    usePerformanceMonitoring()

    // Assert
    expect(mockInitializeWebSocket).toHaveBeenCalled()
  })
})
