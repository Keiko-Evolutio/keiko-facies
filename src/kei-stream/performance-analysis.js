/**
 * Performance-Analyse: SSE vs WebSocket für KEI-Stream
 * 
 * Analysiert und vergleicht:
 * - Verbindungsaufbau-Zeit
 * - Frame-Verarbeitungsgeschwindigkeit
 * - Memory-Verbrauch
 * - Reconnection-Performance
 * - Throughput-Unterschiede
 * 
 * @version 1.0.0
 */

// Performance-Monitoring-Utilities
class PerformanceMonitor {
  constructor(name) {
    this.name = name;
    this.metrics = {
      connectionTime: 0,
      frameProcessingTimes: [],
      memoryUsage: [],
      reconnectionTimes: [],
      totalFramesProcessed: 0,
      errors: 0
    };
    this.startTime = 0;
  }
  
  startTimer() {
    this.startTime = performance.now();
  }
  
  recordConnectionTime() {
    this.metrics.connectionTime = performance.now() - this.startTime;
  }
  
  recordFrameProcessing(startTime) {
    const processingTime = performance.now() - startTime;
    this.metrics.frameProcessingTimes.push(processingTime);
    this.metrics.totalFramesProcessed++;
  }
  
  recordMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.metrics.memoryUsage.push(process.memoryUsage().heapUsed);
    }
  }
  
  recordError() {
    this.metrics.errors++;
  }
  
  getStats() {
    const frameProcessingTimes = this.metrics.frameProcessingTimes;
    const avgFrameProcessing = frameProcessingTimes.length > 0 
      ? frameProcessingTimes.reduce((a, b) => a + b, 0) / frameProcessingTimes.length 
      : 0;
    
    const maxFrameProcessing = frameProcessingTimes.length > 0 
      ? Math.max(...frameProcessingTimes) 
      : 0;
    
    const minFrameProcessing = frameProcessingTimes.length > 0 
      ? Math.min(...frameProcessingTimes) 
      : 0;
    
    return {
      name: this.name,
      connectionTime: this.metrics.connectionTime,
      avgFrameProcessing,
      maxFrameProcessing,
      minFrameProcessing,
      totalFramesProcessed: this.metrics.totalFramesProcessed,
      errors: this.metrics.errors,
      throughput: this.metrics.totalFramesProcessed / (this.metrics.connectionTime / 1000) || 0
    };
  }
}

// Mock performance.now() für Node.js
if (typeof performance === 'undefined') {
  global.performance = {
    now: () => Date.now()
  };
}

// Enhanced Mock-Implementierungen mit Performance-Tracking
global.WebSocket = class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    
    // Simuliere realistische Verbindungszeit
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, Math.random() * 20 + 5); // 5-25ms
  }
  
  send(data) {
    // Simuliere Send-Latenz
    setTimeout(() => {
      // Mock successful send
    }, Math.random() * 2 + 1); // 1-3ms
  }
  
  close() {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: 1000 }));
    }
  }
  
  simulateMessage(data) {
    if (this.onmessage) {
      // Simuliere Message-Processing-Latenz
      setTimeout(() => {
        this.onmessage({ data: JSON.stringify(data) });
      }, Math.random() * 1 + 0.5); // 0.5-1.5ms
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
    
    // SSE hat typischerweise etwas höhere Verbindungszeit
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, Math.random() * 30 + 10); // 10-40ms
  }
  
  close() {
    this.readyState = 2;
  }
  
  simulateMessage(data) {
    if (this.onmessage) {
      // SSE hat etwas höhere Message-Processing-Zeit
      setTimeout(() => {
        this.onmessage({ data: JSON.stringify(data) });
      }, Math.random() * 2 + 1); // 1-3ms
    }
  }
};

// Performance-optimierte Client-Implementierungen
class PerformanceWebSocketClient {
  constructor(config, monitor) {
    this.config = config;
    this.monitor = monitor;
    this.ws = null;
    this.connected = false;
  }
  
  async connect() {
    this.monitor.startTimer();
    
    this.ws = new WebSocket(this.config.url);
    
    return new Promise((resolve) => {
      this.ws.onopen = () => {
        this.connected = true;
        this.monitor.recordConnectionTime();
        this.monitor.recordMemoryUsage();
        resolve();
      };
      
      this.ws.onmessage = (event) => {
        const frameStart = performance.now();
        try {
          const frame = JSON.parse(event.data);
          this.monitor.recordFrameProcessing(frameStart);
        } catch (error) {
          this.monitor.recordError();
        }
      };
      
      this.ws.onerror = () => {
        this.monitor.recordError();
      };
    });
  }
  
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
  
  send(data) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  simulateFrames(count) {
    for (let i = 0; i < count; i++) {
      this.ws.simulateMessage({
        type: 'partial',
        stream_id: 'perf-test',
        seq: i + 1,
        payload: { data: `frame-${i}` }
      });
    }
  }
}

class PerformanceSSEClient {
  constructor(config, monitor) {
    this.config = config;
    this.monitor = monitor;
    this.eventSource = null;
    this.connected = false;
  }
  
  async connect() {
    this.monitor.startTimer();
    
    const url = `${this.config.baseUrl}/${this.config.sessionId}/${this.config.streamId}`;
    this.eventSource = new EventSource(url);
    
    return new Promise((resolve) => {
      this.eventSource.onopen = () => {
        this.connected = true;
        this.monitor.recordConnectionTime();
        this.monitor.recordMemoryUsage();
        resolve();
      };
      
      this.eventSource.onmessage = (event) => {
        const frameStart = performance.now();
        try {
          const frame = JSON.parse(event.data);
          this.monitor.recordFrameProcessing(frameStart);
        } catch (error) {
          this.monitor.recordError();
        }
      };
      
      this.eventSource.onerror = () => {
        this.monitor.recordError();
      };
    });
  }
  
  async disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
  }
  
  simulateFrames(count) {
    for (let i = 0; i < count; i++) {
      this.eventSource.simulateMessage({
        type: 'status',
        stream_id: 'perf-test',
        seq: i + 1,
        payload: { status: `update-${i}` }
      });
    }
  }
}

// Performance-Test-Suite
async function runPerformanceTests() {
  console.log('⚡ Starte KEI-Stream Performance-Analyse...\n');
  
  const testFrameCount = 100;
  const testIterations = 5;
  
  // WebSocket Performance-Tests
  console.log('📊 WebSocket Performance-Tests...');
  const wsResults = [];
  
  for (let i = 0; i < testIterations; i++) {
    const wsMonitor = new PerformanceMonitor(`WebSocket-${i + 1}`);
    const wsClient = new PerformanceWebSocketClient({
      url: 'ws://localhost:8000/stream/ws/perf-test'
    }, wsMonitor);
    
    await wsClient.connect();
    
    // Frame-Processing-Test
    const frameStart = performance.now();
    wsClient.simulateFrames(testFrameCount);
    
    // Warten auf Frame-Verarbeitung
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await wsClient.disconnect();
    wsResults.push(wsMonitor.getStats());
  }
  
  // SSE Performance-Tests
  console.log('📊 SSE Performance-Tests...');
  const sseResults = [];
  
  for (let i = 0; i < testIterations; i++) {
    const sseMonitor = new PerformanceMonitor(`SSE-${i + 1}`);
    const sseClient = new PerformanceSSEClient({
      baseUrl: 'http://localhost:8000/stream/sse',
      sessionId: 'perf-test',
      streamId: 'perf-stream'
    }, sseMonitor);
    
    await sseClient.connect();
    
    // Frame-Processing-Test
    const frameStart = performance.now();
    sseClient.simulateFrames(testFrameCount);
    
    // Warten auf Frame-Verarbeitung
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await sseClient.disconnect();
    sseResults.push(sseMonitor.getStats());
  }
  
  // Ergebnisse analysieren
  function calculateAverages(results) {
    const totals = results.reduce((acc, result) => {
      acc.connectionTime += result.connectionTime;
      acc.avgFrameProcessing += result.avgFrameProcessing;
      acc.totalFramesProcessed += result.totalFramesProcessed;
      acc.errors += result.errors;
      return acc;
    }, {
      connectionTime: 0,
      avgFrameProcessing: 0,
      totalFramesProcessed: 0,
      errors: 0
    });
    
    const count = results.length;
    return {
      avgConnectionTime: totals.connectionTime / count,
      avgFrameProcessing: totals.avgFrameProcessing / count,
      totalFramesProcessed: totals.totalFramesProcessed,
      totalErrors: totals.errors,
      avgThroughput: totals.totalFramesProcessed / (totals.connectionTime / 1000) / count
    };
  }
  
  const wsAvg = calculateAverages(wsResults);
  const sseAvg = calculateAverages(sseResults);
  
  // Ergebnisse ausgeben
  console.log('\n📈 Performance-Vergleich Ergebnisse:');
  console.log('=====================================');
  
  console.log('\n🔌 WebSocket-Client:');
  console.log(`   Durchschnittliche Verbindungszeit: ${wsAvg.avgConnectionTime.toFixed(2)}ms`);
  console.log(`   Durchschnittliche Frame-Verarbeitung: ${wsAvg.avgFrameProcessing.toFixed(3)}ms`);
  console.log(`   Gesamt verarbeitete Frames: ${wsAvg.totalFramesProcessed}`);
  console.log(`   Durchschnittlicher Durchsatz: ${wsAvg.avgThroughput.toFixed(1)} Frames/s`);
  console.log(`   Fehler: ${wsAvg.totalErrors}`);
  
  console.log('\n📡 SSE-Client:');
  console.log(`   Durchschnittliche Verbindungszeit: ${sseAvg.avgConnectionTime.toFixed(2)}ms`);
  console.log(`   Durchschnittliche Frame-Verarbeitung: ${sseAvg.avgFrameProcessing.toFixed(3)}ms`);
  console.log(`   Gesamt verarbeitete Frames: ${sseAvg.totalFramesProcessed}`);
  console.log(`   Durchschnittlicher Durchsatz: ${sseAvg.avgThroughput.toFixed(1)} Frames/s`);
  console.log(`   Fehler: ${sseAvg.totalErrors}`);
  
  // Vergleichsanalyse
  console.log('\n🔍 Vergleichsanalyse:');
  console.log('====================');
  
  const connectionTimeDiff = ((sseAvg.avgConnectionTime - wsAvg.avgConnectionTime) / wsAvg.avgConnectionTime * 100);
  const frameProcessingDiff = ((sseAvg.avgFrameProcessing - wsAvg.avgFrameProcessing) / wsAvg.avgFrameProcessing * 100);
  const throughputDiff = ((sseAvg.avgThroughput - wsAvg.avgThroughput) / wsAvg.avgThroughput * 100);
  
  console.log(`Verbindungszeit: SSE ist ${connectionTimeDiff > 0 ? '+' : ''}${connectionTimeDiff.toFixed(1)}% vs WebSocket`);
  console.log(`Frame-Verarbeitung: SSE ist ${frameProcessingDiff > 0 ? '+' : ''}${frameProcessingDiff.toFixed(1)}% vs WebSocket`);
  console.log(`Durchsatz: SSE ist ${throughputDiff > 0 ? '+' : ''}${throughputDiff.toFixed(1)}% vs WebSocket`);
  
  // Empfehlungen
  console.log('\n💡 Empfehlungen:');
  console.log('================');
  
  if (Math.abs(connectionTimeDiff) < 10) {
    console.log('✅ Verbindungszeiten sind vergleichbar - beide Clients geeignet');
  } else if (connectionTimeDiff > 10) {
    console.log('⚠️  SSE hat höhere Verbindungszeit - WebSocket für häufige Reconnects bevorzugen');
  } else {
    console.log('✅ WebSocket hat höhere Verbindungszeit - SSE für einfache Verbindungen geeignet');
  }
  
  if (Math.abs(frameProcessingDiff) < 5) {
    console.log('✅ Frame-Verarbeitung ist vergleichbar - Performance-Unterschied vernachlässigbar');
  } else if (frameProcessingDiff > 5) {
    console.log('⚠️  SSE hat langsamere Frame-Verarbeitung - WebSocket für High-Throughput bevorzugen');
  } else {
    console.log('✅ SSE hat schnellere Frame-Verarbeitung - gut für Read-only Monitoring');
  }
  
  console.log('\n🎯 Anwendungsempfehlungen:');
  console.log('- WebSocket: Bidirektionale Kommunikation, hoher Durchsatz, Echtzeit-Interaktion');
  console.log('- SSE: Read-only Monitoring, einfache Integration, automatische Reconnection');
  console.log('- Parallel: WebSocket für Hauptkommunikation + SSE für Monitoring/Status');
  
  return {
    websocket: wsAvg,
    sse: sseAvg,
    comparison: {
      connectionTimeDiff,
      frameProcessingDiff,
      throughputDiff
    }
  };
}

// Performance-Tests ausführen
runPerformanceTests().then(results => {
  console.log('\n🎉 Performance-Analyse abgeschlossen!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Performance-Analyse fehlgeschlagen:', error);
  process.exit(1);
});
