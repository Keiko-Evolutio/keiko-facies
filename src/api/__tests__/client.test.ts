/**
 * Test für KeikoAPIClient cacheKey Scope Fix
 * 
 * Testet, dass cacheKey korrekt im Scope verfügbar ist und keine ReferenceError auftritt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { KeikoAPIClient } from '../client'

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      request: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    }))
  }
}))

// Mock dependencies
vi.mock('@/store/endpoint', () => ({
  API_ENDPOINT: 'http://localhost:8000'
}))

vi.mock('@/services/cache/cacheManager', () => ({
  defaultCacheManager: {
    get: vi.fn(),
    set: vi.fn(),
    resolveStrategy: vi.fn(() => ({ ttlMs: 5000, tags: ['test'] })),
    invalidateByTag: vi.fn()
  }
}))

vi.mock('@/services/deduplication/requestDeduplicator', () => ({
  defaultDeduplicator: {
    buildKey: vi.fn(() => 'test-key'),
    run: vi.fn((key, fn) => fn())
  }
}))

vi.mock('@/store/perf', () => ({
  usePerfStore: {
    getState: vi.fn(() => ({
      collector: {
        recordCacheHit: vi.fn(),
        recordCacheMiss: vi.fn()
      }
    }))
  }
}))

describe('KeikoAPIClient cacheKey Scope Fix', () => {
  let client: KeikoAPIClient
  let mockAxios: any

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    
    // Get fresh client instance
    client = KeikoAPIClient.getInstance()
    
    // Setup axios mock
    const axios = require('axios')
    mockAxios = axios.default.create()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sollte cacheKey korrekt im Scope haben für GET requests', async () => {
    // Arrange
    const testSchema = z.object({ message: z.string() })
    const mockResponse = { data: { message: 'test' } }
    
    mockAxios.request.mockResolvedValue(mockResponse)

    // Act & Assert - sollte keine ReferenceError werfen
    await expect(
      client.get('/api/v1/test', testSchema)
    ).resolves.not.toThrow()
  })

  it('sollte cacheKey korrekt im Scope haben für POST requests', async () => {
    // Arrange
    const testSchema = z.object({ success: z.boolean() })
    const mockResponse = { data: { success: true } }
    
    mockAxios.request.mockResolvedValue(mockResponse)

    // Act & Assert - sollte keine ReferenceError werfen
    await expect(
      client.post('/api/v1/test', testSchema, { body: { test: 'data' } })
    ).resolves.not.toThrow()
  })

  it('sollte cacheKey im finally block verfügbar sein', async () => {
    // Arrange
    const testSchema = z.object({ message: z.string() })
    
    // Mock axios to throw error to trigger finally block
    mockAxios.request.mockRejectedValue(new Error('Network error'))

    // Act & Assert - sollte keine ReferenceError werfen, auch wenn Fehler auftritt
    const result = await client.get('/api/v1/test', testSchema)
    
    // Sollte Fehler-Response zurückgeben, aber keine ReferenceError werfen
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('sollte inflight cache korrekt verwalten', async () => {
    // Arrange
    const testSchema = z.object({ message: z.string() })
    const mockResponse = { data: { message: 'test' } }
    
    mockAxios.request.mockResolvedValue(mockResponse)

    // Act - Zwei parallele GET requests
    const promise1 = client.get('/api/v1/test', testSchema)
    const promise2 = client.get('/api/v1/test', testSchema)

    const [result1, result2] = await Promise.all([promise1, promise2])

    // Assert - Beide sollten erfolgreich sein
    expect(result1.ok).toBe(true)
    expect(result2.ok).toBe(true)
  })

  it('sollte cacheKey nur für GET requests setzen', async () => {
    // Arrange
    const testSchema = z.object({ success: z.boolean() })
    const mockResponse = { data: { success: true } }
    
    mockAxios.request.mockResolvedValue(mockResponse)

    // Act
    await client.post('/api/v1/test', testSchema, { body: { test: 'data' } })

    // Assert - POST sollte funktionieren ohne cacheKey Probleme
    expect(mockAxios.request).toHaveBeenCalled()
  })
})
