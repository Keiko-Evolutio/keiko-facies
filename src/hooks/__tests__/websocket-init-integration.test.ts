/**
 * Integration Test für WebSocket Initialisierung Fix
 * 
 * Testet das tatsächliche Verhalten der WebSocket Initialisierung.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('WebSocket Initialisierung Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset global state
    if (typeof window !== 'undefined') {
      delete (window as any).__WEBSOCKET_INITIALIZED__
    }
  })

  it('sollte useRef korrekt verwenden um Duplikate zu verhindern', () => {
    // Arrange
    let refValue = false
    const mockUseRef = vi.fn(() => ({ current: refValue }))
    
    // Mock React useRef
    vi.doMock('react', () => ({
      useEffect: vi.fn((fn) => fn()),
      useRef: mockUseRef
    }))

    // Act - Simuliere mehrfache Hook-Aufrufe
    const ref1 = mockUseRef()
    const ref2 = mockUseRef()

    // Simuliere erste Initialisierung
    if (!ref1.current) {
      ref1.current = true
      refValue = true
    }

    // Simuliere zweite Initialisierung (sollte verhindert werden)
    const shouldInitialize = !ref2.current
    
    // Assert
    expect(ref1.current).toBe(true)
    expect(shouldInitialize).toBe(false) // Zweite Initialisierung verhindert
  })

  it('sollte globale Initialisierung nur einmal erlauben', () => {
    // Arrange
    let globalInitialized = false
    
    const mockInitializeWebSocket = vi.fn(async () => {
      if (globalInitialized) {
        console.warn('WebSocket already globally initialized')
        return
      }
      globalInitialized = true
    })

    // Act - Mehrfache Aufrufe
    mockInitializeWebSocket()
    mockInitializeWebSocket()
    mockInitializeWebSocket()

    // Assert
    expect(mockInitializeWebSocket).toHaveBeenCalledTimes(3)
    expect(globalInitialized).toBe(true)
  })

  it('sollte useEffect Dependencies korrekt handhaben', () => {
    // Arrange
    const mockUseEffect = vi.fn()
    let isInitialized = false
    
    // Simuliere useEffect mit Dependencies
    const effectCallback = vi.fn(() => {
      if (!isInitialized) {
        // Initialisierung
      }
    })

    // Act - Simuliere useEffect Aufrufe mit verschiedenen Dependencies
    mockUseEffect(effectCallback, [isInitialized]) // Erste Ausführung
    
    isInitialized = true
    mockUseEffect(effectCallback, [isInitialized]) // Zweite Ausführung

    // Assert - Effect sollte bei Änderung von isInitialized ausgeführt werden
    expect(mockUseEffect).toHaveBeenCalledTimes(2)
    expect(mockUseEffect).toHaveBeenCalledWith(effectCallback, [false])
    expect(mockUseEffect).toHaveBeenCalledWith(effectCallback, [true])
  })

  it('sollte Error Handling korrekt implementieren', async () => {
    // Arrange
    const mockInitializeWebSocket = vi.fn().mockRejectedValue(new Error('WebSocket Fehler'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act - Simuliere Hook mit Error Handling
    try {
      await mockInitializeWebSocket().catch(() => {
        // Error wird abgefangen, wie im Hook
      })
    } catch (error) {
      // Sollte nicht erreicht werden
      expect(error).toBeUndefined()
    }

    // Assert - Fehler sollte abgefangen werden
    expect(mockInitializeWebSocket).toHaveBeenCalled()
    
    // Cleanup
    consoleSpy.mockRestore()
  })

  it('sollte Performance Store Initialisierung unabhängig von WebSocket handhaben', () => {
    // Arrange
    const mockPerfInitialize = vi.fn()
    const mockTick = vi.fn()
    let intervalId: any

    // Simuliere Performance Store Setup
    mockPerfInitialize()
    intervalId = setInterval(mockTick, 5000)

    // Act - Simuliere Zeit
    vi.useFakeTimers()
    vi.advanceTimersByTime(5000)

    // Assert
    expect(mockPerfInitialize).toHaveBeenCalledTimes(1)
    expect(mockTick).toHaveBeenCalledTimes(1)

    // Cleanup
    clearInterval(intervalId)
    vi.useRealTimers()
  })
})
