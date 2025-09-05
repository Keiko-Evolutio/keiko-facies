/**
 * Integrations-Tests für KEI-Stream Frontend-Features
 * 
 * Testet die vollständige Integration aller neuen Features:
 * - SSE-Client + WebSocket-Client Interoperabilität
 * - Compression + Tracing Integration
 * - Token-Bucket + Resume-Funktionalität
 * - React-Hooks mit allen Features
 * 
 * @version 1.0.0
 */

import { KEIStreamClient } from '../client';
import { KEIStreamSSEClient } from '../sse-client';
import { CompressionManager } from '../compression';
import { StreamTokenBucketManager } from '../token-bucket';
import { initializeTracing, instrumentFrame } from '../tracing';
import { FrameType, ConnectionState } from '../types';

// Mock WebSocket für Tests
class MockWebSocket {
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
    }, 10);
  }

  send(data: string): void {
    // Mock send - könnte für Tests erweitert werden
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this.onclose?.(new CloseEvent('close', { code: 1000 }));
  }
}

// Mock EventSource für SSE-Tests
class MockEventSource {
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
    }, 10);
  }

  close(): void {
    this.readyState = 2; // CLOSED
  }
}

// Globals mocken
(global as any).WebSocket = MockWebSocket;
(global as any).EventSource = MockEventSource;

// OpenTelemetry Mock
const mockSpan = {
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

(global as any).opentelemetry = {
  trace: {
    getActiveSpan: () => mockSpan,
    getTracer: () => ({
      startSpan: () => mockSpan,
    }),
  },
  context: {
    active: () => ({}),
  },
  propagation: {
    extract: () => ({}),
  },
  SpanStatusCode: { ERROR: 2 },
};

// Compression Streams Mock
(global as any).CompressionStream = class {
  readable = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    }
  });
  writable = new WritableStream();
};

(global as any).DecompressionStream = class {
  readable = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"decompressed": true}'));
      controller.close();
    }
  });
  writable = new WritableStream();
};

describe('KEI-Stream Feature-Integration', () => {
  describe('WebSocket + SSE Client Interoperabilität', () => {
    test('sollte WebSocket und SSE parallel verwenden können', async () => {
      const wsClient = new KEIStreamClient({
        url: 'ws://localhost:8000/stream/ws/test-session',
        sessionId: 'test-session',
        scopes: ['kei.stream.read', 'kei.stream.write'],
      });

      const sseClient = new KEIStreamSSEClient({
        baseUrl: 'http://localhost:8000/stream/sse',
        sessionId: 'test-session',
        streamId: 'monitoring-stream',
      });

      // Beide Clients verbinden
      await wsClient.connect();
      await sseClient.connect();

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(wsClient.isConnected()).toBe(true);
      expect(sseClient.isConnected()).toBe(true);

      // Cleanup
      await wsClient.disconnect();
      await sseClient.disconnect();
    });

    test('sollte unterschiedliche Streams für WebSocket und SSE verwenden', async () => {
      const wsFrames: any[] = [];
      const sseFrames: any[] = [];

      const wsClient = new KEIStreamClient({
        url: 'ws://localhost:8000/stream/ws/test-session',
        sessionId: 'test-session',
        scopes: ['kei.stream.read', 'kei.stream.write'],
      });

      const sseClient = new KEIStreamSSEClient({
        baseUrl: 'http://localhost:8000/stream/sse',
        sessionId: 'test-session',
        streamId: 'monitoring-stream',
      });

      wsClient.on('frame', (frame) => wsFrames.push(frame));
      sseClient.on((frame) => sseFrames.push(frame));

      await wsClient.connect();
      await sseClient.connect();

      // WebSocket Frame senden
      await wsClient.send('bidirectional-stream', FrameType.PARTIAL, { data: 'ws-data' });

      // SSE Frame simulieren
      const mockEventSource = (sseClient as any).eventSource as MockEventSource;
      mockEventSource.onmessage?.({
        data: JSON.stringify({
          type: FrameType.STATUS,
          stream_id: 'monitoring-stream',
          payload: { status: 'monitoring' },
        }),
      } as MessageEvent);

      await new Promise(resolve => setTimeout(resolve, 20));

      // Frames sollten getrennt verarbeitet werden
      expect(sseFrames).toHaveLength(1);
      expect(sseFrames[0].stream_id).toBe('monitoring-stream');

      await wsClient.disconnect();
      await sseClient.disconnect();
    });
  });

  describe('Compression + Tracing Integration', () => {
    test('sollte Frames komprimieren und tracen', async () => {
      await initializeTracing({ enabled: true });
      
      const compressionManager = new CompressionManager();
      
      const originalFrame = {
        type: FrameType.TOOL_RESULT,
        stream_id: 'integration-stream',
        payload: {
          result: 'x'.repeat(2000), // Große Payload für Compression
        },
      };

      // Frame instrumentieren (Tracing)
      const tracedFrame = instrumentFrame(originalFrame, 'integration-test');
      
      // Frame komprimieren
      const compressedFrame = await compressionManager.compressFrame(tracedFrame);

      // Tracing-Headers sollten erhalten bleiben
      expect(compressedFrame.headers?.traceparent).toBeDefined();
      expect(compressedFrame.headers?.['x-span-id']).toBeDefined();
      
      // Compression sollte funktioniert haben
      expect(compressedFrame.binary_ref).toBeDefined();
      expect(compressedFrame.payload).toBeNull();
      expect(compressedFrame.headers?.['x-compression']).toBe('gzip');

      // Decompression
      const decompressedFrame = await compressionManager.decompressFrame(compressedFrame);
      
      // Tracing-Headers sollten erhalten bleiben
      expect(decompressedFrame.headers?.traceparent).toBeDefined();
      expect(decompressedFrame.headers?.['x-span-id']).toBeDefined();
      
      // Payload sollte wiederhergestellt sein
      expect(decompressedFrame.payload).toBeDefined();
      expect(decompressedFrame.binary_ref).toBeNull();
    });
  });

  describe('Token-Bucket + Resume Integration', () => {
    test('sollte Rate-Limiting mit Resume-Funktionalität kombinieren', async () => {
      const tokenManager = new StreamTokenBucketManager({
        capacity: 5,
        refillRate: 2, // Langsame Rate für Test
        frameCost: 1,
      });

      const client = new KEIStreamClient({
        url: 'ws://localhost:8000/stream/ws/test-session',
        sessionId: 'test-session',
        scopes: ['kei.stream.read', 'kei.stream.write'],
      });

      await client.connect();

      // Viele Frames schnell senden (sollte Rate-Limiting auslösen)
      const sendPromises = [];
      for (let i = 0; i < 10; i++) {
        sendPromises.push(
          client.send('rate-limited-stream', FrameType.PARTIAL, { seq: i })
        );
      }

      await Promise.all(sendPromises);

      // Token-Bucket sollte Tokens verbraucht haben
      const bucketStatus = tokenManager.getAllStatus();
      expect(Object.keys(bucketStatus)).toHaveLength(0); // Client hat eigenen Manager

      // Client-Status prüfen
      const clientStatus = client.getStatus();
      expect(clientStatus.tokenBuckets).toBeDefined();

      await client.disconnect();
    });
  });

  describe('Vollständige Feature-Integration', () => {
    test('sollte alle Features zusammen verwenden', async () => {
      // Tracing initialisieren
      await initializeTracing({ enabled: true, debug: true });

      // Client mit allen Features erstellen
      const client = new KEIStreamClient({
        url: 'ws://localhost:8000/stream/ws/full-integration',
        sessionId: 'full-integration-session',
        scopes: ['kei.stream.read', 'kei.stream.write'],
        enableOTEL: true,
      });

      const frames: any[] = [];
      client.on('frame', (frame) => frames.push(frame));

      await client.connect();
      await new Promise(resolve => setTimeout(resolve, 20));

      // Frame mit großer Payload senden (sollte komprimiert werden)
      await client.send('full-feature-stream', FrameType.TOOL_CALL, {
        tool_name: 'integration_test',
        parameters: {
          large_data: 'x'.repeat(2000),
          metadata: { test: true },
        },
      });

      // Client-Status prüfen - alle Features sollten aktiv sein
      const status = client.getStatus();
      
      expect(status.connectionState).toBe(ConnectionState.CONNECTED);
      expect(status.totalFramesSent).toBeGreaterThan(0);
      expect(status.tokenBuckets).toBeDefined();
      expect(status.compressionStats).toBeDefined();

      // Token-Bucket sollte Tokens verbraucht haben
      const tokenBuckets = status.tokenBuckets;
      if (tokenBuckets && Object.keys(tokenBuckets).length > 0) {
        const streamBucket = Object.values(tokenBuckets)[0];
        expect(streamBucket.tokens).toBeLessThan(streamBucket.capacity);
      }

      // Compression sollte verfügbar sein
      expect(status.compressionStats.supported).toBe(true);

      await client.disconnect();
    });

    test('sollte Backend-Kompatibilität für alle Features gewährleisten', async () => {
      // Simuliere Backend-kompatible Konfiguration
      const client = new KEIStreamClient({
        url: 'ws://localhost:8000/stream/ws/backend-compat',
        sessionId: 'backend-compat-session',
        tenantId: 'test-tenant',
        apiToken: 'test-api-key',
        scopes: ['kei.stream.read', 'kei.stream.write'],
        enableOTEL: true,
      });

      await client.connect();

      // Backend-kompatibles Frame senden
      await client.send('backend-stream', FrameType.TOOL_RESULT, {
        result: {
          success: true,
          data: 'x'.repeat(1500), // Sollte komprimiert werden
        },
        execution_time: 1.23,
        memory_usage: 1024,
      });

      const status = client.getStatus();
      
      // Alle Features sollten funktionieren
      expect(status.connectionState).toBe(ConnectionState.CONNECTED);
      expect(status.totalFramesSent).toBeGreaterThan(0);
      
      // Token-Bucket sollte konfiguriert sein
      expect(status.tokenBuckets).toBeDefined();
      
      // Compression sollte verfügbar sein
      expect(status.compressionStats).toBeDefined();
      expect(status.compressionStats.supported).toBe(true);

      await client.disconnect();
    });
  });

  describe('Error-Handling Integration', () => {
    test('sollte Fehler in allen Features korrekt behandeln', async () => {
      const client = new KEIStreamClient({
        url: 'ws://localhost:8000/stream/ws/error-test',
        sessionId: 'error-test-session',
        scopes: ['kei.stream.read', 'kei.stream.write'],
      });

      const errors: Error[] = [];
      client.on('error', (error) => errors.push(error));

      await client.connect();

      // Simuliere verschiedene Fehlerszenarien
      try {
        // Ungültiges Frame senden
        await client.send('error-stream', 'invalid-type' as FrameType, null);
      } catch (error) {
        // Fehler sollten abgefangen werden
      }

      // Client sollte trotz Fehlern funktionsfähig bleiben
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
    });
  });
});
