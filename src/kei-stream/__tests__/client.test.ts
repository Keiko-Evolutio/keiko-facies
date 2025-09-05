/**
 * Tests für KEI-Stream Client
 * 
 * Umfassende Unit-Tests für den KEI-Stream Client mit
 * deutschen Kommentaren und englischen Bezeichnern.
 * 
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KEIStreamClient } from '../client';
import { FrameType, ConnectionState, KEIStreamClientConfig } from '../types';

// Mock für WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simuliere asynchrone Verbindung
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket ist nicht verbunden');
    }
    // Simuliere Echo für Tests
    setTimeout(() => {
      const frame = JSON.parse(data);
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({
        ...frame,
        type: 'ack',
        ack: { ack_seq: frame.seq || 0, credit: 16 }
      }) }));
    }, 5);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

// WebSocket global mocken
global.WebSocket = MockWebSocket as any;

describe('KEIStreamClient', () => {
  let client: KEIStreamClient;
  let config: KEIStreamClientConfig;

  beforeEach(() => {
    config = {
      url: 'ws://localhost:8000/stream/ws/test-session',
      sessionId: 'test-session',
      scopes: ['kei.stream.read', 'kei.stream.write'],
      ackCreditTarget: 16,
      ackEvery: 5,
      reconnectInitialMs: 100,
      reconnectMaxMs: 1000,
    };
    
    client = new KEIStreamClient(config);
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
    vi.clearAllMocks();
  });

  describe('Initialisierung', () => {
    it('sollte Client mit korrekter Konfiguration erstellen', () => {
      expect(client).toBeInstanceOf(KEIStreamClient);
      
      const status = client.getStatus();
      expect(status.connectionState).toBe(ConnectionState.DISCONNECTED);
      expect(status.reconnectAttempts).toBe(0);
      expect(status.totalFramesSent).toBe(0);
      expect(status.totalFramesReceived).toBe(0);
    });

    it('sollte Standard-Werte für optionale Konfiguration verwenden', () => {
      const minimalConfig: KEIStreamClientConfig = {
        url: 'ws://localhost:8000/stream/ws/minimal',
        sessionId: 'minimal-session',
      };
      
      const minimalClient = new KEIStreamClient(minimalConfig);
      expect(minimalClient).toBeInstanceOf(KEIStreamClient);
      
      minimalClient.disconnect();
    });
  });

  describe('Verbindungsmanagement', () => {
    it('sollte erfolgreich verbinden', async () => {
      await client.connect();
      
      const status = client.getStatus();
      expect(status.connectionState).toBe(ConnectionState.CONNECTED);
      expect(status.connectedAt).toBeInstanceOf(Date);
    });

    it('sollte URL-Parameter korrekt setzen', async () => {
      const configWithAuth: KEIStreamClientConfig = {
        ...config,
        apiToken: 'test-token',
        tenantId: 'test-tenant',
      };
      
      const clientWithAuth = new KEIStreamClient(configWithAuth);
      await clientWithAuth.connect();
      
      // WebSocket-URL sollte Parameter enthalten
      const mockWs = (clientWithAuth as any).ws as MockWebSocket;
      expect(mockWs.url).toContain('access_token=test-token');
      expect(mockWs.url).toContain('tenant_id=test-tenant');
      expect(mockWs.url).toContain('scopes=kei.stream.read%20kei.stream.write');
      
      clientWithAuth.disconnect();
    });

    it('sollte Verbindung korrekt trennen', async () => {
      await client.connect();
      await client.disconnect();
      
      const status = client.getStatus();
      expect(status.connectionState).toBe(ConnectionState.DISCONNECTED);
    });

    it('sollte Verbindungsfehler korrekt behandeln', async () => {
      // Mock WebSocket um Fehler zu simulieren
      const originalWebSocket = global.WebSocket;
      global.WebSocket = class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          setTimeout(() => {
            this.onerror?.(new Event('error'));
          }, 5);
        }
      } as any;

      await expect(client.connect()).rejects.toThrow();
      
      const status = client.getStatus();
      expect(status.connectionState).toBe(ConnectionState.ERROR);
      expect(status.lastError).toBeInstanceOf(Error);
      
      // WebSocket zurücksetzen
      global.WebSocket = originalWebSocket;
    });
  });

  describe('Frame-Handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('sollte Frame korrekt senden', () => {
      const testPayload = { message: 'test', timestamp: Date.now() };
      
      client.send('test-stream', FrameType.PARTIAL, testPayload);
      
      const status = client.getStatus();
      expect(status.totalFramesSent).toBeGreaterThan(0);
    });

    it('sollte Listener korrekt registrieren und aufrufen', (done) => {
      const testFrame = {
        type: FrameType.PARTIAL,
        stream_id: 'test-stream',
        seq: 1,
        payload: { test: true },
      };

      // Listener registrieren
      const cleanup = client.on('test-stream', (frame) => {
        expect(frame.type).toBe(FrameType.PARTIAL);
        expect(frame.stream_id).toBe('test-stream');
        expect(frame.payload).toEqual({ test: true });
        cleanup();
        done();
      });

      // Frame simulieren
      const mockWs = (client as any).ws as MockWebSocket;
      mockWs.onmessage?.(new MessageEvent('message', { 
        data: JSON.stringify(testFrame) 
      }));
    });

    it('sollte globale Listener korrekt aufrufen', (done) => {
      const testFrame = {
        type: FrameType.STATUS,
        stream_id: 'any-stream',
        seq: 1,
        payload: { status: 'ok' },
      };

      // Globalen Listener registrieren
      const cleanup = client.onAny((frame) => {
        expect(frame.type).toBe(FrameType.STATUS);
        expect(frame.stream_id).toBe('any-stream');
        cleanup();
        done();
      });

      // Frame simulieren
      const mockWs = (client as any).ws as MockWebSocket;
      mockWs.onmessage?.(new MessageEvent('message', { 
        data: JSON.stringify(testFrame) 
      }));
    });

    it('sollte ACK-Frames korrekt verarbeiten', () => {
      const ackFrame = {
        type: FrameType.ACK,
        stream_id: 'test-stream',
        ack: { ack_seq: 5, credit: 20 },
      };

      // ACK-Frame simulieren
      const mockWs = (client as any).ws as MockWebSocket;
      mockWs.onmessage?.(new MessageEvent('message', { 
        data: JSON.stringify(ackFrame) 
      }));

      // Credit-Window sollte aktualisiert werden
      const creditWindow = (client as any).creditWindowByStream.get('test-stream');
      expect(creditWindow).toBe(20);
    });

    it('sollte Heartbeat-Frames beantworten', () => {
      const heartbeatFrame = {
        type: FrameType.HEARTBEAT,
        stream_id: 'test-stream',
      };

      const sendSpy = vi.spyOn(client as any, 'sendRawFrame');

      // Heartbeat-Frame simulieren
      const mockWs = (client as any).ws as MockWebSocket;
      mockWs.onmessage?.(new MessageEvent('message', { 
        data: JSON.stringify(heartbeatFrame) 
      }));

      // Heartbeat-Antwort sollte gesendet werden
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: FrameType.HEARTBEAT,
          stream_id: 'test-stream',
        })
      );
    });
  });

  describe('Replay-Funktionalität', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('sollte Frames für Replay aufzeichnen', () => {
      const testFrames = [
        { type: FrameType.PARTIAL, stream_id: 'test-stream', seq: 1, payload: { data: 'frame1' } },
        { type: FrameType.PARTIAL, stream_id: 'test-stream', seq: 2, payload: { data: 'frame2' } },
        { type: FrameType.FINAL, stream_id: 'test-stream', seq: 3, payload: { data: 'frame3' } },
      ];

      const mockWs = (client as any).ws as MockWebSocket;
      
      // Frames simulieren
      testFrames.forEach(frame => {
        mockWs.onmessage?.(new MessageEvent('message', { 
          data: JSON.stringify(frame) 
        }));
      });

      // Replay testen
      const replayedFrames = client.replay('test-stream', 1);
      expect(replayedFrames).toHaveLength(2); // Frames mit seq > 1
      expect(replayedFrames[0].seq).toBe(2);
      expect(replayedFrames[1].seq).toBe(3);
    });

    it('sollte leeres Array für unbekannte Streams zurückgeben', () => {
      const replayedFrames = client.replay('unknown-stream', 0);
      expect(replayedFrames).toEqual([]);
    });
  });

  describe('Status-Tracking', () => {
    it('sollte korrekten Status zurückgeben', async () => {
      const initialStatus = client.getStatus();
      expect(initialStatus.connectionState).toBe(ConnectionState.DISCONNECTED);
      expect(initialStatus.streams.size).toBe(0);

      await client.connect();

      const connectedStatus = client.getStatus();
      expect(connectedStatus.connectionState).toBe(ConnectionState.CONNECTED);
      expect(connectedStatus.connectedAt).toBeInstanceOf(Date);
    });

    it('sollte Stream-Status korrekt tracken', async () => {
      await client.connect();
      
      // Frame senden um Stream zu erstellen
      client.send('test-stream', FrameType.PARTIAL, { test: true });
      
      const status = client.getStatus();
      expect(status.streams.has('test-stream')).toBe(false); // Noch kein eingehender Frame
      
      // Eingehenden Frame simulieren
      const mockWs = (client as any).ws as MockWebSocket;
      mockWs.onmessage?.(new MessageEvent('message', { 
        data: JSON.stringify({
          type: FrameType.PARTIAL,
          stream_id: 'test-stream',
          seq: 1,
        })
      }));

      // Stream sollte jetzt getrackt werden
      const updatedStatus = client.getStatus();
      expect(updatedStatus.streams.has('test-stream')).toBe(true);
    });
  });

  describe('Fehlerbehandlung', () => {
    it('sollte ungültige JSON-Nachrichten ignorieren', async () => {
      await client.connect();
      
      const mockWs = (client as any).ws as MockWebSocket;
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Ungültige JSON-Nachricht simulieren
      mockWs.onmessage?.(new MessageEvent('message', { 
        data: 'invalid json' 
      }));

      // Sollte keine Fehler werfen
      expect(consoleSpy).toHaveBeenCalledWith(
        'Fehler beim Parsen der eingehenden Nachricht:',
        expect.any(SyntaxError)
      );
      
      consoleSpy.mockRestore();
    });

    it('sollte Listener-Fehler abfangen', async () => {
      await client.connect();
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Fehlerhaften Listener registrieren
      client.on('test-stream', () => {
        throw new Error('Listener-Fehler');
      });

      // Frame senden
      const mockWs = (client as any).ws as MockWebSocket;
      mockWs.onmessage?.(new MessageEvent('message', { 
        data: JSON.stringify({
          type: FrameType.PARTIAL,
          stream_id: 'test-stream',
          seq: 1,
        })
      }));

      expect(consoleSpy).toHaveBeenCalledWith(
        'Fehler in Stream-Listener:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Cleanup', () => {
    it('sollte Listener korrekt entfernen', async () => {
      await client.connect();
      
      const listener = vi.fn();
      const cleanup = client.on('test-stream', listener);
      
      // Frame senden - Listener sollte aufgerufen werden
      const mockWs = (client as any).ws as MockWebSocket;
      mockWs.onmessage?.(new MessageEvent('message', { 
        data: JSON.stringify({
          type: FrameType.PARTIAL,
          stream_id: 'test-stream',
          seq: 1,
        })
      }));
      
      expect(listener).toHaveBeenCalledTimes(1);
      
      // Listener entfernen
      cleanup();
      
      // Erneut Frame senden - Listener sollte nicht mehr aufgerufen werden
      mockWs.onmessage?.(new MessageEvent('message', { 
        data: JSON.stringify({
          type: FrameType.PARTIAL,
          stream_id: 'test-stream',
          seq: 2,
        })
      }));
      
      expect(listener).toHaveBeenCalledTimes(1); // Immer noch nur einmal
    });
  });
});
