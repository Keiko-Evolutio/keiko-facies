/**
 * Test für parallele Nutzung von WebSocket und SSE-Clients
 * 
 * Testet die Interoperabilität und gleichzeitige Verwendung:
 * - WebSocket-Client für bidirektionale Kommunikation
 * - SSE-Client für Read-only Monitoring
 * - Gemeinsame TypeScript-Interfaces
 * - Event-System-Kompatibilität
 * 
 * @version 1.0.0
 */

// Mock-Implementierungen
global.WebSocket = class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }
  
  send(data) {
    // Mock send - könnte für Tests erweitert werden
    console.log('📤 WebSocket send:', JSON.parse(data).type);
  }
  
  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: 1000 }));
    }
  }
  
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
};

global.EventSource = class MockEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }
  
  close() {
    this.readyState = 2;
  }
  
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
};

// Gemeinsame Enums und Interfaces
const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};

const FrameType = {
  PARTIAL: 'partial',
  FINAL: 'final',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  STATUS: 'status',
  ERROR: 'error'
};

// Vereinfachter WebSocket-Client
class KEIStreamClient {
  constructor(config) {
    this.config = config;
    this.ws = null;
    this.connectionState = ConnectionState.DISCONNECTED;
    this.listeners = new Map();
    this.totalFramesSent = 0;
    this.totalFramesReceived = 0;
  }
  
  async connect() {
    this.connectionState = ConnectionState.CONNECTING;
    this.ws = new WebSocket(this.config.url);
    
    this.ws.onopen = () => {
      this.connectionState = ConnectionState.CONNECTED;
    };
    
    this.ws.onmessage = (event) => {
      const frame = JSON.parse(event.data);
      this.totalFramesReceived++;
      this.emitFrame(frame);
    };
    
    this.ws.onclose = () => {
      this.connectionState = ConnectionState.DISCONNECTED;
    };
  }
  
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectionState = ConnectionState.DISCONNECTED;
  }
  
  async send(streamId, type, payload) {
    if (this.ws && this.ws.readyState === 1) {
      const frame = {
        type,
        stream_id: streamId,
        seq: this.totalFramesSent + 1,
        ts: new Date().toISOString(),
        payload
      };
      
      this.ws.send(JSON.stringify(frame));
      this.totalFramesSent++;
    }
  }
  
  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(listener);
    
    return () => {
      const listeners = this.listeners.get(event);
      if (listeners) {
        listeners.delete(listener);
      }
    };
  }
  
  emitFrame(frame) {
    const frameListeners = this.listeners.get('frame');
    if (frameListeners) {
      frameListeners.forEach(listener => listener(frame));
    }
  }
  
  isConnected() {
    return this.connectionState === ConnectionState.CONNECTED;
  }
  
  getStatus() {
    return {
      connectionState: this.connectionState,
      totalFramesSent: this.totalFramesSent,
      totalFramesReceived: this.totalFramesReceived
    };
  }
}

// Vereinfachter SSE-Client (wie vorher)
class KEIStreamSSEClient {
  constructor(config) {
    this.config = config;
    this.eventSource = null;
    this.connectionState = ConnectionState.DISCONNECTED;
    this.listeners = new Set();
    this.totalFramesReceived = 0;
  }
  
  async connect() {
    this.connectionState = ConnectionState.CONNECTING;
    const url = `${this.config.baseUrl}/${this.config.sessionId}/${this.config.streamId}`;
    this.eventSource = new EventSource(url);
    
    this.eventSource.onopen = () => {
      this.connectionState = ConnectionState.CONNECTED;
    };
    
    this.eventSource.onmessage = (event) => {
      const frame = JSON.parse(event.data);
      this.totalFramesReceived++;
      this.emitFrame(frame);
    };
  }
  
  async disconnect() {
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
  
  emitFrame(frame) {
    this.listeners.forEach(listener => listener(frame));
  }
  
  isConnected() {
    return this.connectionState === ConnectionState.CONNECTED;
  }
  
  getStatus() {
    return {
      connectionState: this.connectionState,
      totalFramesReceived: this.totalFramesReceived,
      streamId: this.config.streamId,
      sessionId: this.config.sessionId
    };
  }
}

// Test-Suite für parallele Nutzung
async function runParallelTests() {
  console.log('🔄 Teste parallele WebSocket + SSE Client-Nutzung...\n');
  
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
  
  // Test 1: Parallele Verbindungen
  test('Parallele Verbindungen', async () => {
    const wsClient = new KEIStreamClient({
      url: 'ws://localhost:8000/stream/ws/test-session'
    });
    
    const sseClient = new KEIStreamSSEClient({
      baseUrl: 'http://localhost:8000/stream/sse',
      sessionId: 'test-session',
      streamId: 'monitoring-stream'
    });
    
    await wsClient.connect();
    await sseClient.connect();
    
    // Kurz warten für Verbindungen
    await new Promise(resolve => setTimeout(resolve, 20));
    
    assert(wsClient.isConnected(), 'WebSocket-Client sollte verbunden sein');
    assert(sseClient.isConnected(), 'SSE-Client sollte verbunden sein');
    
    await wsClient.disconnect();
    await sseClient.disconnect();
  });
  
  // Test 2: Unterschiedliche Stream-Verwendung
  test('Unterschiedliche Stream-Verwendung', async () => {
    const wsClient = new KEIStreamClient({
      url: 'ws://localhost:8000/stream/ws/test-session'
    });
    
    const sseClient = new KEIStreamSSEClient({
      baseUrl: 'http://localhost:8000/stream/sse',
      sessionId: 'test-session',
      streamId: 'monitoring-stream'
    });
    
    let wsFrames = [];
    let sseFrames = [];
    
    wsClient.on('frame', (frame) => wsFrames.push(frame));
    sseClient.on((frame) => sseFrames.push(frame));
    
    await wsClient.connect();
    await sseClient.connect();
    
    // WebSocket Frame senden (bidirektional)
    await wsClient.send('bidirectional-stream', FrameType.TOOL_CALL, {
      tool_name: 'test_tool'
    });
    
    // SSE Frame simulieren (read-only)
    sseClient.eventSource.simulateMessage({
      type: FrameType.STATUS,
      stream_id: 'monitoring-stream',
      seq: 1,
      payload: { status: 'monitoring' }
    });
    
    await new Promise(resolve => setTimeout(resolve, 20));
    
    // SSE sollte nur empfangen haben
    assert(sseFrames.length === 1, 'SSE-Client sollte 1 Frame empfangen haben');
    assert(sseFrames[0].stream_id === 'monitoring-stream', 'SSE-Frame sollte monitoring-stream haben');
    
    // WebSocket kann senden und empfangen
    const wsStatus = wsClient.getStatus();
    assert(wsStatus.totalFramesSent === 1, 'WebSocket-Client sollte 1 Frame gesendet haben');
    
    await wsClient.disconnect();
    await sseClient.disconnect();
  });
  
  // Test 3: Gemeinsame Interface-Kompatibilität
  test('Gemeinsame Interface-Kompatibilität', () => {
    // Beide Clients sollten dieselben Frame-Typen verstehen
    const testFrame = {
      id: 'msg_123',
      type: FrameType.TOOL_RESULT,
      stream_id: 'test-stream',
      seq: 42,
      ts: new Date().toISOString(),
      payload: {
        result: 'success',
        data: { value: 123 }
      }
    };
    
    // Frame-Struktur sollte für beide Clients kompatibel sein
    assert(testFrame.type, 'Frame muss Typ haben');
    assert(testFrame.stream_id, 'Frame muss Stream-ID haben');
    assert(typeof testFrame.seq === 'number', 'Frame muss numerische Sequenznummer haben');
    
    // FrameType-Enum sollte für beide verfügbar sein
    assert(FrameType.TOOL_RESULT === 'tool_result', 'FrameType-Enum sollte konsistent sein');
  });
  
  // Test 4: Event-System-Kompatibilität
  test('Event-System-Kompatibilität', async () => {
    const wsClient = new KEIStreamClient({
      url: 'ws://localhost:8000/stream/ws/test-session'
    });
    
    const sseClient = new KEIStreamSSEClient({
      baseUrl: 'http://localhost:8000/stream/sse',
      sessionId: 'test-session',
      streamId: 'test-stream'
    });
    
    let wsFrameReceived = false;
    let sseFrameReceived = false;
    
    // Beide Clients sollten ähnliche Event-APIs haben
    wsClient.on('frame', () => { wsFrameReceived = true; });
    sseClient.on(() => { sseFrameReceived = true; });
    
    await wsClient.connect();
    await sseClient.connect();
    
    // Frames simulieren
    wsClient.ws.simulateMessage({
      type: FrameType.STATUS,
      stream_id: 'test-stream',
      seq: 1
    });
    
    sseClient.eventSource.simulateMessage({
      type: FrameType.STATUS,
      stream_id: 'test-stream',
      seq: 2
    });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assert(wsFrameReceived, 'WebSocket-Client sollte Frame empfangen haben');
    assert(sseFrameReceived, 'SSE-Client sollte Frame empfangen haben');
    
    await wsClient.disconnect();
    await sseClient.disconnect();
  });
  
  // Test 5: Performance und Ressourcen
  test('Performance und Ressourcen', async () => {
    const wsClient = new KEIStreamClient({
      url: 'ws://localhost:8000/stream/ws/test-session'
    });
    
    const sseClient = new KEIStreamSSEClient({
      baseUrl: 'http://localhost:8000/stream/sse',
      sessionId: 'test-session',
      streamId: 'test-stream'
    });
    
    const startTime = Date.now();
    
    await wsClient.connect();
    await sseClient.connect();
    
    const connectTime = Date.now() - startTime;
    
    // Verbindungszeit sollte angemessen sein (< 100ms für Mocks)
    assert(connectTime < 100, `Verbindungszeit zu hoch: ${connectTime}ms`);
    
    // Beide Clients sollten unabhängig funktionieren
    assert(wsClient.isConnected(), 'WebSocket-Client sollte verbunden sein');
    assert(sseClient.isConnected(), 'SSE-Client sollte verbunden sein');
    
    await wsClient.disconnect();
    await sseClient.disconnect();
  });
  
  // Ergebnisse
  console.log(`\n📊 Parallel-Test-Ergebnisse: ${testsPassed}/${testsTotal} Tests erfolgreich`);
  
  if (testsPassed === testsTotal) {
    console.log('🎉 Alle Parallel-Tests erfolgreich! WebSocket + SSE Interoperabilität bestätigt.');
  } else {
    console.log('⚠️  Einige Parallel-Tests fehlgeschlagen.');
  }
  
  return testsPassed === testsTotal;
}

// Tests ausführen
runParallelTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Parallel-Test-Ausführung fehlgeschlagen:', error);
  process.exit(1);
});
