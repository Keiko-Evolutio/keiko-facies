/**
 * Test für Webhook Authentication Fix
 * 
 * Testet, dass X-Scopes Header in Development-Modus korrekt gesetzt werden.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { KeikoAPIClient } from '../client'

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      },
      request: vi.fn()
    }))
  }
}))

describe('Webhook Authentication Fix', () => {
  let client: KeikoAPIClient
  let mockAxios: any
  let requestInterceptor: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup axios mock
    const axiosCreate = axios.create as any
    mockAxios = {
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      },
      request: vi.fn()
    }
    axiosCreate.mockReturnValue(mockAxios)
    
    // Capture request interceptor
    mockAxios.interceptors.request.use.mockImplementation((interceptor: any) => {
      requestInterceptor = interceptor
    })
    
    // Get fresh client instance
    client = KeikoAPIClient.getInstance()
  })

  it('sollte X-Scopes Header für Webhook-Endpunkte in Development setzen', () => {
    // Arrange
    const originalEnv = import.meta.env.DEV
    
    // Mock development environment
    Object.defineProperty(import.meta.env, 'DEV', {
      value: true,
      configurable: true
    })

    const config = {
      url: '/api/v1/webhooks/targets',
      headers: {}
    }

    // Act
    const result = requestInterceptor(config)

    // Assert
    expect(result.headers['X-Scopes']).toBe('webhook:admin:* webhook:targets:manage webhook:dlq:manage webhook:outbound:send:*')
    expect(result.headers['X-Trace-Id']).toBeDefined()

    // Restore
    Object.defineProperty(import.meta.env, 'DEV', {
      value: originalEnv,
      configurable: true
    })
  })

  it('sollte X-Scopes Header für Webhook-Deliveries-Endpunkte setzen', () => {
    // Arrange
    Object.defineProperty(import.meta.env, 'DEV', {
      value: true,
      configurable: true
    })

    const config = {
      url: '/api/v1/webhooks/deliveries?limit=100',
      headers: {}
    }

    // Act
    const result = requestInterceptor(config)

    // Assert
    expect(result.headers['X-Scopes']).toBe('webhook:admin:* webhook:targets:manage webhook:dlq:manage webhook:outbound:send:*')
  })

  it('sollte keine X-Scopes Header für Nicht-Webhook-Endpunkte setzen', () => {
    // Arrange
    Object.defineProperty(import.meta.env, 'DEV', {
      value: true,
      configurable: true
    })

    const config = {
      url: '/api/v1/health',
      headers: {}
    }

    // Act
    const result = requestInterceptor(config)

    // Assert
    expect(result.headers['X-Scopes']).toBeUndefined()
    expect(result.headers['X-Trace-Id']).toBeDefined()
  })

  it('sollte keine X-Scopes Header in Production setzen', () => {
    // Arrange
    Object.defineProperty(import.meta.env, 'DEV', {
      value: false,
      configurable: true
    })
    Object.defineProperty(import.meta.env, 'MODE', {
      value: 'production',
      configurable: true
    })

    const config = {
      url: '/api/v1/webhooks/targets',
      headers: {}
    }

    // Act
    const result = requestInterceptor(config)

    // Assert
    expect(result.headers['X-Scopes']).toBeUndefined()
    expect(result.headers['X-Trace-Id']).toBeDefined()
  })

  it('sollte Bearer Token korrekt setzen wenn verfügbar', () => {
    // Arrange
    const testToken = 'test-bearer-token'
    client.setBearerToken(testToken)

    const config = {
      url: '/api/v1/webhooks/targets',
      headers: {}
    }

    // Act
    const result = requestInterceptor(config)

    // Assert
    expect(result.headers['Authorization']).toBe(`Bearer ${testToken}`)
  })

  it('sollte Content-Type für Nicht-FormData setzen', () => {
    // Arrange
    const config = {
      url: '/api/v1/webhooks/targets',
      headers: {},
      data: { test: 'data' }
    }

    // Act
    const result = requestInterceptor(config)

    // Assert
    expect(result.headers['Content-Type']).toBe('application/json')
  })

  it('sollte bestehende Headers nicht überschreiben', () => {
    // Arrange
    Object.defineProperty(import.meta.env, 'DEV', {
      value: true,
      configurable: true
    })

    const config = {
      url: '/api/v1/webhooks/targets',
      headers: {
        'Custom-Header': 'custom-value',
        'X-Scopes': 'existing-scopes'
      }
    }

    // Act
    const result = requestInterceptor(config)

    // Assert
    expect(result.headers['Custom-Header']).toBe('custom-value')
    expect(result.headers['X-Scopes']).toBe('existing-scopes') // Bestehender Header bleibt
  })
})
