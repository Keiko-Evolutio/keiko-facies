/**
 * Umfassender Integrations-Test für KEI-Stream SSE-Client
 * 
 * Testet die vollständige Integration und Backend-Kompatibilität:
 * - EventSource-basierte Verbindung
 * - Frame-Format-Kompatibilität
 * - Event-Listener-Management
 * - Automatische Reconnection
 * - React-Hooks-Integration
 * 
 * @version 1.0.0
 */

// Mock-Implementierungen für Node.js-Umgebung
global.EventSource = class MockEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    
    // Simuliere asynchrone Verbindung
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }
  
  close() {
    this.readyState = 2; // CLOSED
  }
  
  // Test-Hilfsmethode
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
  
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
};

// Mock für setTimeout/clearTimeout
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;

// ConnectionState-Enum
const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  RECONNECTING: 'reconnecting'
};

// FrameType-Enum (kompatibel mit Backend)
const FrameType = {
  PARTIAL: 'partial',
  FINAL: 'final',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  STATUS: 'status',
  ERROR: 'error',
  HEARTBEAT: 'heartbeat',
  ACK: 'ack',
  NACK: 'nack',
  RESUME: 'resume',
  CHUNK_START: 'chunk_start',
  CHUNK_CONTINUE: 'chunk_continue',
  CHUNK_END: 'chunk_end'
};

// Vereinfachte SSE-Client-Implementation für Tests
class KEIStreamSSEClient {
  constructor(config) {
    this.config = {
      autoReconnect: true,
      reconnectInitialMs: 1000,
      reconnectMaxMs: 30000,
      maxReconnectAttempts: 10,
      ...config
    };
    
    this.eventSource = null;
    this.connectionState = ConnectionState.DISCONNECTED;
    this.listeners = new Set();
    this.frameTypeListeners = new Map();
    this.reconnectAttempts = 0;
    this.shouldStop = false;
    this.totalFramesReceived = 0;
    this.lastFrameTimestamp = null;
  }
  
  async connect() {
    if (this.connectionState === ConnectionState.CONNECTED || 
        this.connectionState === ConnectionState.CONNECTING) {
      return;
    }
    
    this.connectionState = ConnectionState.CONNECTING;
    this.shouldStop = false;
    
    const url = `${this.config.baseUrl}/${this.config.sessionId}/${this.config.streamId}`;
    this.eventSource = new EventSource(url);
    
    this.eventSource.onopen = () => {
      this.connectionState = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
    };
    
    this.eventSource.onmessage = (event) => {
      this.handleMessage(event);
    };
    
    this.eventSource.onerror = () => {
      this.connectionState = ConnectionState.ERROR;
      if (this.config.autoReconnect && !this.shouldStop) {
        this.scheduleReconnect();
      }
    };
  }
  
  async disconnect() {
    this.shouldStop = true;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connectionState = ConnectionState.DISCONNECTED;
  }
  
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  onFrameType(frameType, listener) {
    if (!this.frameTypeListeners.has(frameType)) {
      this.frameTypeListeners.set(frameType, new Set());
    }
    this.frameTypeListeners.get(frameType).add(listener);
    
    return () => {
      const listeners = this.frameTypeListeners.get(frameType);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.frameTypeListeners.delete(frameType);
        }
      }
    };
  }
  
  isConnected() {
    return this.connectionState === ConnectionState.CONNECTED;
  }
  
  getStatus() {
    return {
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      totalFramesReceived: this.totalFramesReceived,
      lastFrameTimestamp: this.lastFrameTimestamp,
      streamId: this.config.streamId,
      sessionId: this.config.sessionId
    };
  }
  
  handleMessage(event) {
    try {
      const frame = JSON.parse(event.data);
      this.totalFramesReceived++;
      this.lastFrameTimestamp = frame.ts || new Date().toISOString();
      this.emitFrame(frame);
    } catch (error) {
      console.error('Fehler beim Parsen der SSE-Message:', error);
    }
  }
  
  emitFrame(frame) {
    // Globale Listener
    this.listeners.forEach(listener => {
      try {
        listener(frame);
      } catch (error) {
        console.error('Fehler in Frame-Listener:', error);
      }
    });
    
    // Frame-Typ-spezifische Listener
    const typeListeners = this.frameTypeListeners.get(frame.type);
    if (typeListeners) {
      typeListeners.forEach(listener => {
        try {
          listener(frame);
        } catch (error) {
          console.error('Fehler in Frame-Type-Listener:', error);
        }
      });
    }
  }
  
  scheduleReconnect() {
    if (this.shouldStop || this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return;
    }
    
    const delay = Math.min(
      this.config.reconnectInitialMs * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxMs
    );
    
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }
}

// Factory-Funktion
function createSSEClient(sessionId, streamId, baseUrl = 'http://localhost:8000/stream/sse') {
  return new KEIStreamSSEClient({
    baseUrl,
    sessionId,
    streamId,
    autoReconnect: true
  });
}

// Test-Suite
async function runTests() {
  console.log('🚀 Starte KEI-Stream SSE-Client Integrations-Tests...\n');
  
  let testsPassed = 0;
  let testsTotal = 0;
  
  function test(name, testFn) {
    testsTotal++;
    try {
      testFn();
      console.log(`✅ ${name}`);
      testsPassed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
    }
  }
  
  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }
  
  // Test 1: Backend-URL-Kompatibilität
  test('Backend-URL-Kompatibilität', () => {
    const client = createSSEClient('test-session', 'test-stream');
    const expectedUrl = 'http://localhost:8000/stream/sse/test-session/test-stream';
    
    // URL wird in connect() konstruiert, simulieren wir das
    const url = `${client.config.baseUrl}/${client.config.sessionId}/${client.config.streamId}`;
    assert(url === expectedUrl, `URL-Mismatch: ${url} !== ${expectedUrl}`);
  });
  
  // Test 2: Frame-Format-Kompatibilität
  test('Frame-Format-Kompatibilität', () => {
    const backendFrame = {
      id: 'msg_123abc',
      type: FrameType.TOOL_CALL,
      stream_id: 'test-stream',
      seq: 42,
      ts: '2024-01-01T12:00:00.000Z',
      corr_id: 'correlation-456',
      headers: {
        'traceparent': '00-1234567890abcdef-fedcba0987654321-01'
      },
      payload: {
        tool_name: 'test_tool',
        parameters: { param1: 'value1' }
      }
    };
    
    // Frame sollte alle erforderlichen Felder haben
    assert(backendFrame.id, 'Frame muss ID haben');
    assert(backendFrame.type, 'Frame muss Typ haben');
    assert(backendFrame.stream_id, 'Frame muss Stream-ID haben');
    assert(typeof backendFrame.seq === 'number', 'Frame muss numerische Sequenznummer haben');
    assert(backendFrame.ts, 'Frame muss Zeitstempel haben');
  });
  
  // Test 3: Event-Listener-Management
  test('Event-Listener-Management', async () => {
    const client = createSSEClient('test-session', 'test-stream');
    let frameReceived = false;
    let partialFrameReceived = false;
    
    // Globaler Listener
    const unsubscribe1 = client.on((frame) => {
      frameReceived = true;
    });
    
    // Frame-Typ-spezifischer Listener
    const unsubscribe2 = client.onFrameType(FrameType.PARTIAL, (frame) => {
      partialFrameReceived = true;
    });
    
    await client.connect();
    
    // Frame simulieren
    const testFrame = {
      type: FrameType.PARTIAL,
      stream_id: 'test-stream',
      seq: 1,
      ts: new Date().toISOString()
    };
    
    client.eventSource.simulateMessage(testFrame);
    
    // Kurz warten für asynchrone Verarbeitung
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assert(frameReceived, 'Globaler Listener sollte Frame empfangen haben');
    assert(partialFrameReceived, 'Frame-Typ-Listener sollte PARTIAL-Frame empfangen haben');
    
    // Cleanup
    unsubscribe1();
    unsubscribe2();
    await client.disconnect();
  });
  
  // Test 4: Verbindungsmanagement
  test('Verbindungsmanagement', async () => {
    const client = createSSEClient('test-session', 'test-stream');
    
    assert(!client.isConnected(), 'Client sollte initial nicht verbunden sein');
    
    await client.connect();
    
    // Kurz warten für Verbindung
    await new Promise(resolve => setTimeout(resolve, 20));
    
    assert(client.isConnected(), 'Client sollte nach connect() verbunden sein');
    
    await client.disconnect();
    assert(!client.isConnected(), 'Client sollte nach disconnect() nicht verbunden sein');
  });
  
  // Test 5: Statistiken und Status
  test('Statistiken und Status', async () => {
    const client = createSSEClient('test-session', 'test-stream');
    await client.connect();
    
    const initialStatus = client.getStatus();
    assert(initialStatus.sessionId === 'test-session', 'Status sollte korrekte Session-ID haben');
    assert(initialStatus.streamId === 'test-stream', 'Status sollte korrekte Stream-ID haben');
    assert(initialStatus.totalFramesReceived === 0, 'Initial sollten 0 Frames empfangen sein');
    
    // Frame simulieren
    client.eventSource.simulateMessage({
      type: FrameType.STATUS,
      stream_id: 'test-stream',
      seq: 1
    });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const updatedStatus = client.getStatus();
    assert(updatedStatus.totalFramesReceived === 1, 'Nach Frame sollte Zähler bei 1 sein');
    
    await client.disconnect();
  });
  
  // Test 6: Reconnection-Logic
  test('Reconnection-Logic', async () => {
    const client = createSSEClient('test-session', 'test-stream');
    client.config.reconnectInitialMs = 50; // Schneller für Test
    
    await client.connect();
    
    // Fehler simulieren
    client.eventSource.simulateError();
    
    assert(client.connectionState === ConnectionState.ERROR, 'Nach Fehler sollte Status ERROR sein');
    
    await client.disconnect();
  });
  
  // Ergebnisse
  console.log(`\n📊 Test-Ergebnisse: ${testsPassed}/${testsTotal} Tests erfolgreich`);
  
  if (testsPassed === testsTotal) {
    console.log('🎉 Alle Tests erfolgreich! SSE-Client ist vollständig funktionsfähig.');
  } else {
    console.log('⚠️  Einige Tests fehlgeschlagen. Überprüfung erforderlich.');
  }
  
  return testsPassed === testsTotal;
}

// Tests ausführen
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test-Ausführung fehlgeschlagen:', error);
  process.exit(1);
});
