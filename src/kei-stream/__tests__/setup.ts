/**
 * Test-Setup für KEI-Stream Unit-Tests
 * 
 * Konfiguriert globale Mocks und Test-Utilities für:
 * - WebSocket und EventSource APIs
 * - OpenTelemetry Tracing
 * - Compression Streams
 * - Timer und Async-Funktionen
 * 
 * @version 1.0.0
 */

// Jest-Konfiguration für Timers
jest.useFakeTimers();

// Global Mocks für Browser-APIs
beforeAll(() => {
  // WebSocket Mock
  if (typeof WebSocket === 'undefined') {
    (global as any).WebSocket = class MockWebSocket {
      public onopen: ((event: Event) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;
      public onclose: ((event: CloseEvent) => void) | null = null;
      public onerror: ((event: Event) => void) | null = null;
      public readyState: number = 0;
      public url: string;

      constructor(url: string) {
        this.url = url;
        setTimeout(() => {
          this.readyState = 1; // OPEN
          this.onopen?.(new Event('open'));
        }, 0);
      }

      send(data: string): void {
        // Mock implementation
      }

      close(): void {
        this.readyState = 3; // CLOSED
        this.onclose?.(new CloseEvent('close', { code: 1000 }));
      }
    };
  }

  // EventSource Mock
  if (typeof EventSource === 'undefined') {
    (global as any).EventSource = class MockEventSource {
      public onopen: ((event: Event) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;
      public onerror: ((event: Event) => void) | null = null;
      public readyState: number = 0;
      public url: string;

      constructor(url: string) {
        this.url = url;
        setTimeout(() => {
          this.readyState = 1; // OPEN
          this.onopen?.(new Event('open'));
        }, 0);
      }

      close(): void {
        this.readyState = 2; // CLOSED
      }
    };
  }

  // CompressionStream Mock
  if (typeof CompressionStream === 'undefined') {
    (global as any).CompressionStream = class MockCompressionStream {
      readable: ReadableStream;
      writable: WritableStream;

      constructor(format: string) {
        const chunks: Uint8Array[] = [];
        
        this.writable = new WritableStream({
          write(chunk: Uint8Array) {
            chunks.push(chunk);
          },
          close() {
            // Simuliere Compression
          }
        });

        this.readable = new ReadableStream({
          start(controller) {
            setTimeout(() => {
              // Simuliere komprimierte Daten
              const compressed = new Uint8Array([1, 2, 3, 4, 5]);
              controller.enqueue(compressed);
              controller.close();
            }, 0);
          }
        });
      }
    };
  }

  // DecompressionStream Mock
  if (typeof DecompressionStream === 'undefined') {
    (global as any).DecompressionStream = class MockDecompressionStream {
      readable: ReadableStream;
      writable: WritableStream;

      constructor(format: string) {
        this.writable = new WritableStream({
          write(chunk: Uint8Array) {
            // Mock write
          }
        });

        this.readable = new ReadableStream({
          start(controller) {
            setTimeout(() => {
              // Simuliere dekomprimierte Daten
              const decompressed = new TextEncoder().encode('{"test": "data"}');
              controller.enqueue(decompressed);
              controller.close();
            }, 0);
          }
        });
      }
    };
  }

  // OpenTelemetry Mock
  if (typeof (global as any).opentelemetry === 'undefined') {
    const mockSpan = {
      spanContext: () => ({
        traceId: '1234567890abcdef1234567890abcdef',
        spanId: 'fedcba0987654321',
        traceFlags: 1,
        isValid: () => true,
        traceState: {
          serialize: () => 'key1=value1,key2=value2',
        },
      }),
      setAttributes: jest.fn(),
      recordException: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    };

    (global as any).opentelemetry = {
      trace: {
        getActiveSpan: jest.fn(() => mockSpan),
        getTracer: jest.fn(() => ({
          startSpan: jest.fn(() => mockSpan),
        })),
      },
      context: {
        active: jest.fn(() => ({})),
      },
      propagation: {
        extract: jest.fn(() => ({})),
      },
      SpanStatusCode: {
        ERROR: 2,
        OK: 1,
      },
    };
  }

  // Performance Mock (für Memory-Monitoring)
  if (typeof performance === 'undefined') {
    (global as any).performance = {
      now: () => Date.now(),
      memory: {
        usedJSHeapSize: 1024 * 1024,
        totalJSHeapSize: 2 * 1024 * 1024,
        jsHeapSizeLimit: 4 * 1024 * 1024,
      },
    };
  }

  // TextEncoder/TextDecoder für Node.js-Umgebung
  if (typeof TextEncoder === 'undefined') {
    const { TextEncoder, TextDecoder } = require('util');
    (global as any).TextEncoder = TextEncoder;
    (global as any).TextDecoder = TextDecoder;
  }

  // Blob Mock für Payload-Size-Estimation
  if (typeof Blob === 'undefined') {
    (global as any).Blob = class MockBlob {
      size: number;
      type: string;

      constructor(parts: any[], options: { type?: string } = {}) {
        this.type = options.type || '';
        this.size = parts.reduce((total, part) => {
          if (typeof part === 'string') {
            return total + part.length;
          }
          return total + (part.length || 0);
        }, 0);
      }
    };
  }

  // btoa/atob für Base64-Encoding
  if (typeof btoa === 'undefined') {
    (global as any).btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
    (global as any).atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
  }
});

// Test-Utilities
export const TestUtils = {
  /**
   * Wartet auf asynchrone Operationen
   */
  async waitFor(ms: number = 10): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Simuliert WebSocket-Message
   */
  simulateWebSocketMessage(ws: any, data: any): void {
    if (ws.onmessage) {
      const event = new MessageEvent('message', {
        data: JSON.stringify(data),
      });
      ws.onmessage(event);
    }
  },

  /**
   * Simuliert EventSource-Message
   */
  simulateEventSourceMessage(eventSource: any, data: any): void {
    if (eventSource.onmessage) {
      const event = new MessageEvent('message', {
        data: JSON.stringify(data),
      });
      eventSource.onmessage(event);
    }
  },

  /**
   * Erstellt Test-Frame
   */
  createTestFrame(overrides: any = {}) {
    return {
      type: 'partial',
      stream_id: 'test-stream',
      seq: 1,
      ts: new Date().toISOString(),
      payload: { test: 'data' },
      ...overrides,
    };
  },

  /**
   * Erstellt große Test-Payload für Compression-Tests
   */
  createLargePayload(size: number = 2000): any {
    return {
      data: 'x'.repeat(size),
      metadata: {
        size,
        timestamp: new Date().toISOString(),
      },
    };
  },

  /**
   * Mock für OpenTelemetry Span
   */
  createMockSpan() {
    return {
      spanContext: () => ({
        traceId: '1234567890abcdef1234567890abcdef',
        spanId: 'fedcba0987654321',
        traceFlags: 1,
        isValid: () => true,
      }),
      setAttributes: jest.fn(),
      recordException: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    };
  },
};

// Cleanup nach jedem Test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

// Cleanup nach allen Tests
afterAll(() => {
  jest.useRealTimers();
});
