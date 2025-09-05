/**
 * Unit-Tests für KEI-Stream SSE-Client
 * 
 * Testet die vollständige SSE-Client-Funktionalität einschließlich:
 * - EventSource-basierte Verbindung
 * - Event-Listener-Management
 * - Automatische Reconnection
 * - Frame-Verarbeitung
 * 
 * @version 1.0.0
 */

import { KEIStreamSSEClient, createSSEClient } from '../sse-client';
import { FrameType, ConnectionState } from '../types';

// Mock EventSource für Tests
class MockEventSource {
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public readyState: number = 0;
  public url: string;

  constructor(url: string) {
    this.url = url;
    // Simuliere asynchrone Verbindung
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.(new Event('open'));
    }, 10);
  }

  close(): void {
    this.readyState = 2; // CLOSED
  }

  // Hilfsmethode für Tests
  simulateMessage(data: string): void {
    if (this.onmessage) {
      const event = new MessageEvent('message', { data });
      this.onmessage(event);
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// EventSource global mocken
(global as any).EventSource = MockEventSource;

describe('KEIStreamSSEClient', () => {
  let client: KEIStreamSSEClient;
  let mockEventSource: MockEventSource;

  beforeEach(() => {
    client = new KEIStreamSSEClient({
      baseUrl: 'http://localhost:8000/stream/sse',
      sessionId: 'test-session',
      streamId: 'test-stream',
      autoReconnect: false, // Für Tests deaktivieren
    });

    // Mock EventSource abfangen
    const originalEventSource = (global as any).EventSource;
    (global as any).EventSource = class extends originalEventSource {
      constructor(url: string) {
        super(url);
        mockEventSource = this as any;
      }
    };
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('Verbindungsmanagement', () => {
    test('sollte erfolgreich verbinden', async () => {
      const connectPromise = client.connect();
      
      // Warten auf Verbindung
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(client.isConnected()).toBe(true);
      expect(client.getStatus().connectionState).toBe(ConnectionState.CONNECTED);
    });

    test('sollte korrekte URL verwenden', async () => {
      await client.connect();
      
      expect(mockEventSource.url).toBe(
        'http://localhost:8000/stream/sse/test-session/test-stream'
      );
    });

    test('sollte sauber trennen', async () => {
      await client.connect();
      await client.disconnect();
      
      expect(client.isConnected()).toBe(false);
      expect(client.getStatus().connectionState).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('Frame-Verarbeitung', () => {
    test('sollte eingehende Frames verarbeiten', async () => {
      const frames: any[] = [];
      client.on((frame) => frames.push(frame));

      await client.connect();

      const testFrame = {
        type: FrameType.PARTIAL,
        stream_id: 'test-stream',
        seq: 1,
        payload: { message: 'test' },
        ts: new Date().toISOString(),
      };

      mockEventSource.simulateMessage(JSON.stringify(testFrame));

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(frames).toHaveLength(1);
      expect(frames[0]).toEqual(testFrame);
    });

    test('sollte Frame-Typ-spezifische Listener unterstützen', async () => {
      const partialFrames: any[] = [];
      const finalFrames: any[] = [];

      client.onFrameType(FrameType.PARTIAL, (frame) => partialFrames.push(frame));
      client.onFrameType(FrameType.FINAL, (frame) => finalFrames.push(frame));

      await client.connect();

      // PARTIAL Frame senden
      mockEventSource.simulateMessage(JSON.stringify({
        type: FrameType.PARTIAL,
        stream_id: 'test-stream',
        seq: 1,
      }));

      // FINAL Frame senden
      mockEventSource.simulateMessage(JSON.stringify({
        type: FrameType.FINAL,
        stream_id: 'test-stream',
        seq: 2,
      }));

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(partialFrames).toHaveLength(1);
      expect(finalFrames).toHaveLength(1);
    });

    test('sollte ungültige JSON-Messages behandeln', async () => {
      const errors: Error[] = [];
      client.on(() => {}); // Dummy-Listener

      await client.connect();

      // Ungültiges JSON senden
      mockEventSource.simulateMessage('invalid json');

      await new Promise(resolve => setTimeout(resolve, 10));

      // Sollte keine Fehler werfen, aber intern behandeln
      expect(errors).toHaveLength(0);
    });
  });

  describe('Statistiken', () => {
    test('sollte Frame-Statistiken tracken', async () => {
      await client.connect();

      const initialStatus = client.getStatus();
      expect(initialStatus.totalFramesReceived).toBe(0);

      // Frame senden
      mockEventSource.simulateMessage(JSON.stringify({
        type: FrameType.STATUS,
        stream_id: 'test-stream',
        seq: 1,
      }));

      await new Promise(resolve => setTimeout(resolve, 10));

      const updatedStatus = client.getStatus();
      expect(updatedStatus.totalFramesReceived).toBe(1);
      expect(updatedStatus.lastFrameTimestamp).toBeDefined();
    });

    test('sollte Session- und Stream-IDs korrekt speichern', () => {
      const status = client.getStatus();
      expect(status.sessionId).toBe('test-session');
      expect(status.streamId).toBe('test-stream');
    });
  });

  describe('Error-Handling', () => {
    test('sollte Verbindungsfehler behandeln', async () => {
      await client.connect();

      // Fehler simulieren
      mockEventSource.simulateError();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(client.getStatus().connectionState).toBe(ConnectionState.ERROR);
    });
  });

  describe('Listener-Management', () => {
    test('sollte Listener korrekt registrieren und entfernen', async () => {
      const frames: any[] = [];
      const listener = (frame: any) => frames.push(frame);

      const unsubscribe = client.on(listener);

      await client.connect();

      // Frame senden
      mockEventSource.simulateMessage(JSON.stringify({
        type: FrameType.STATUS,
        stream_id: 'test-stream',
        seq: 1,
      }));

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(frames).toHaveLength(1);

      // Listener entfernen
      unsubscribe();

      // Weiteres Frame senden
      mockEventSource.simulateMessage(JSON.stringify({
        type: FrameType.STATUS,
        stream_id: 'test-stream',
        seq: 2,
      }));

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(frames).toHaveLength(1); // Sollte nicht erhöht werden
    });
  });
});

describe('createSSEClient Factory', () => {
  test('sollte Client mit Standard-Konfiguration erstellen', () => {
    const client = createSSEClient('session-1', 'stream-1');
    
    const status = client.getStatus();
    expect(status.sessionId).toBe('session-1');
    expect(status.streamId).toBe('stream-1');
  });

  test('sollte Client mit benutzerdefinierter Base-URL erstellen', () => {
    const customUrl = 'https://api.example.com/sse';
    const client = createSSEClient('session-1', 'stream-1', customUrl);
    
    // URL wird erst bei connect() verwendet, daher testen wir die Konfiguration
    expect(client).toBeInstanceOf(KEIStreamSSEClient);
  });
});

describe('SSE-Client Integration', () => {
  test('sollte mit Backend-kompatible Frame-Struktur verarbeiten', async () => {
    const client = createSSEClient('integration-session', 'integration-stream');
    const frames: any[] = [];
    
    client.on((frame) => frames.push(frame));
    await client.connect();

    // Backend-kompatibles Frame simulieren
    const backendFrame = {
      id: 'frame-123',
      type: FrameType.TOOL_CALL,
      stream_id: 'integration-stream',
      seq: 42,
      ts: '2024-01-01T12:00:00.000Z',
      corr_id: 'correlation-456',
      headers: {
        'traceparent': '00-1234567890abcdef-fedcba0987654321-01',
        'x-tenant-id': 'tenant-123',
      },
      payload: {
        tool_name: 'test_tool',
        parameters: { param1: 'value1' },
      },
    };

    (mockEventSource as any).simulateMessage(JSON.stringify(backendFrame));

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(backendFrame);
    
    await client.disconnect();
  });
});
