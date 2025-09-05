/**
 * Praktisches Beispiel: KEI-Stream SSE-Client Verwendung
 * 
 * Zeigt die vollständige Integration des SSE-Clients in React-Komponenten:
 * - useKEIStreamSSE Hook-Verwendung
 * - Parallele WebSocket + SSE Nutzung
 * - Real-time Monitoring-Dashboard
 * - Error-Handling und Reconnection
 * 
 * @version 1.0.0
 */

import React, { useState, useEffect } from 'react';
import {
  useKEIStream,
  useKEIStreamSSE,
  KEIStreamFrame,
  FrameType,
  ConnectionState
} from '../index';

// Monitoring-Dashboard mit SSE-Client
export const MonitoringDashboard: React.FC = () => {
  const [sessionId] = useState('monitoring-session');
  const [selectedStream, setSelectedStream] = useState('system-status');

  // SSE-Client für Read-only Monitoring
  const sseMonitoring = useKEIStreamSSE(
    sessionId,
    selectedStream,
    import.meta.env.VITE_SSE_URL || 'http://localhost:8000/stream/sse'
  );

  // Lokaler State für Dashboard
  const [systemMetrics, setSystemMetrics] = useState({
    cpu: 0,
    memory: 0,
    activeStreams: 0,
    totalFrames: 0
  });

  // Frame-Verarbeitung für Monitoring
  useEffect(() => {
    if (sseMonitoring.lastFrame) {
      const frame = sseMonitoring.lastFrame;
      
      if (frame.type === FrameType.STATUS && frame.payload) {
        // System-Status-Updates verarbeiten
        if (frame.payload.metrics) {
          setSystemMetrics(prev => ({
            ...prev,
            ...frame.payload.metrics
          }));
        }
      }
    }
  }, [sseMonitoring.lastFrame]);

  return (
    <div className="monitoring-dashboard">
      <h2>🔍 KEI-Stream System-Monitoring</h2>
      
      {/* Verbindungsstatus */}
      <div className="connection-status">
        <span className={`status-indicator ${sseMonitoring.isConnected ? 'connected' : 'disconnected'}`}>
          {sseMonitoring.isConnected ? '🟢 Verbunden' : '🔴 Getrennt'}
        </span>
        <span>Stream: {selectedStream}</span>
        <span>Frames: {sseMonitoring.status.totalFramesReceived}</span>
      </div>

      {/* System-Metriken */}
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>CPU-Auslastung</h3>
          <div className="metric-value">{systemMetrics.cpu}%</div>
        </div>
        <div className="metric-card">
          <h3>Speicher</h3>
          <div className="metric-value">{systemMetrics.memory}%</div>
        </div>
        <div className="metric-card">
          <h3>Aktive Streams</h3>
          <div className="metric-value">{systemMetrics.activeStreams}</div>
        </div>
        <div className="metric-card">
          <h3>Gesamt Frames</h3>
          <div className="metric-value">{systemMetrics.totalFrames}</div>
        </div>
      </div>

      {/* Stream-Auswahl */}
      <div className="stream-selector">
        <label>Monitoring-Stream:</label>
        <select 
          value={selectedStream} 
          onChange={(e) => setSelectedStream(e.target.value)}
        >
          <option value="system-status">System Status</option>
          <option value="performance-metrics">Performance Metriken</option>
          <option value="error-logs">Error Logs</option>
          <option value="user-activity">User Activity</option>
        </select>
      </div>

      {/* Letzte Frames */}
      <div className="recent-frames">
        <h3>📨 Letzte Frames</h3>
        <div className="frame-list">
          {sseMonitoring.frames.slice(-10).map((frame, index) => (
            <div key={index} className="frame-item">
              <span className="frame-type">{frame.type}</span>
              <span className="frame-time">
                {frame.ts ? new Date(frame.ts).toLocaleTimeString() : 'N/A'}
              </span>
              <span className="frame-seq">#{frame.seq}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Parallele WebSocket + SSE Nutzung
export const HybridCommunicationExample: React.FC = () => {
  const [sessionId] = useState('hybrid-session');

  // WebSocket-Client für bidirektionale Kommunikation
  const mainStream = useKEIStream({
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:8000/stream/ws/hybrid-session',
    sessionId,
    scopes: ['kei.stream.read', 'kei.stream.write'],
    autoConnect: true
  });

  // SSE-Client für Monitoring
  const monitoringStream = useKEIStreamSSE(
    sessionId,
    'monitoring',
    import.meta.env.VITE_SSE_URL || 'http://localhost:8000/stream/sse'
  );

  // Tool-Call über WebSocket senden
  const sendToolCall = async () => {
    if (mainStream.client) {
      await mainStream.client.send('main-stream', FrameType.TOOL_CALL, {
        tool_name: 'get_system_info',
        parameters: {
          include_metrics: true,
          format: 'json'
        }
      });
    }
  };

  return (
    <div className="hybrid-communication">
      <h2>🔄 Hybrid WebSocket + SSE Kommunikation</h2>
      
      {/* WebSocket-Status */}
      <div className="client-status">
        <h3>🔌 WebSocket-Client (Bidirektional)</h3>
        <div className="status-row">
          <span>Status: {mainStream.connectionState}</span>
          <span>Gesendet: {mainStream.status?.totalFramesSent || 0}</span>
          <span>Empfangen: {mainStream.status?.totalFramesReceived || 0}</span>
        </div>
        <button onClick={sendToolCall} disabled={!mainStream.isConnected}>
          📤 Tool-Call senden
        </button>
      </div>

      {/* SSE-Status */}
      <div className="client-status">
        <h3>📡 SSE-Client (Read-only)</h3>
        <div className="status-row">
          <span>Status: {monitoringStream.connectionState}</span>
          <span>Empfangen: {monitoringStream.status.totalFramesReceived}</span>
          <span>Letztes Frame: {monitoringStream.lastFrame?.ts || 'N/A'}</span>
        </div>
      </div>

      {/* Anwendungsfall-Erklärung */}
      <div className="use-case-explanation">
        <h3>💡 Anwendungsfall</h3>
        <ul>
          <li><strong>WebSocket:</strong> Hauptkommunikation für Tool-Calls, Befehle, interaktive Features</li>
          <li><strong>SSE:</strong> Kontinuierliches Monitoring von System-Status und Metriken</li>
          <li><strong>Vorteil:</strong> Getrennte Kanäle für verschiedene Datentypen und Prioritäten</li>
        </ul>
      </div>
    </div>
  );
};

// Error-Handling und Reconnection-Beispiel
export const RobustSSEExample: React.FC = () => {
  const [sessionId] = useState('robust-session');
  const [streamId] = useState('robust-stream');
  const [connectionHistory, setConnectionHistory] = useState<string[]>([]);

  const sseClient = useKEIStreamSSE(sessionId, streamId);

  // Verbindungshistorie tracken
  useEffect(() => {
    const timestamp = new Date().toLocaleTimeString();
    const status = sseClient.connectionState;
    
    setConnectionHistory(prev => [
      ...prev.slice(-9), // Letzte 10 Einträge behalten
      `${timestamp}: ${status}`
    ]);
  }, [sseClient.connectionState]);

  // Manuelle Reconnection
  const forceReconnect = async () => {
    await sseClient.disconnect();
    setTimeout(() => {
      sseClient.connect();
    }, 1000);
  };

  return (
    <div className="robust-sse-example">
      <h2>🛡️ Robuste SSE-Verbindung</h2>
      
      {/* Verbindungsdetails */}
      <div className="connection-details">
        <h3>Verbindungsstatus</h3>
        <div className="detail-row">
          <span>Aktueller Status:</span>
          <span className={`status ${sseClient.connectionState}`}>
            {sseClient.connectionState}
          </span>
        </div>
        <div className="detail-row">
          <span>Reconnect-Versuche:</span>
          <span>{sseClient.status.reconnectAttempts}</span>
        </div>
        <div className="detail-row">
          <span>Frames empfangen:</span>
          <span>{sseClient.status.totalFramesReceived}</span>
        </div>
      </div>

      {/* Verbindungshistorie */}
      <div className="connection-history">
        <h3>📊 Verbindungshistorie</h3>
        <div className="history-list">
          {connectionHistory.map((entry, index) => (
            <div key={index} className="history-entry">
              {entry}
            </div>
          ))}
        </div>
      </div>

      {/* Manuelle Kontrollen */}
      <div className="manual-controls">
        <button onClick={sseClient.connect} disabled={sseClient.isConnected}>
          🔌 Verbinden
        </button>
        <button onClick={sseClient.disconnect} disabled={!sseClient.isConnected}>
          🔌 Trennen
        </button>
        <button onClick={forceReconnect}>
          🔄 Neu verbinden
        </button>
      </div>

      {/* Error-Handling-Info */}
      <div className="error-handling-info">
        <h3>🛠️ Error-Handling-Features</h3>
        <ul>
          <li>✅ Automatische Reconnection mit exponential backoff</li>
          <li>✅ Graceful degradation bei Verbindungsfehlern</li>
          <li>✅ Frame-Verlust-Erkennung über Sequenznummern</li>
          <li>✅ Timeout-Handling für hängende Verbindungen</li>
          <li>✅ Manual override für Reconnection-Logic</li>
        </ul>
      </div>
    </div>
  );
};

// Haupt-Beispiel-Komponente
export const SSEClientExamples: React.FC = () => {
  const [activeExample, setActiveExample] = useState('monitoring');

  const examples = {
    monitoring: <MonitoringDashboard />,
    hybrid: <HybridCommunicationExample />,
    robust: <RobustSSEExample />
  };

  return (
    <div className="sse-client-examples">
      <h1>📡 KEI-Stream SSE-Client Beispiele</h1>
      
      {/* Beispiel-Navigation */}
      <div className="example-nav">
        <button 
          className={activeExample === 'monitoring' ? 'active' : ''}
          onClick={() => setActiveExample('monitoring')}
        >
          🔍 Monitoring-Dashboard
        </button>
        <button 
          className={activeExample === 'hybrid' ? 'active' : ''}
          onClick={() => setActiveExample('hybrid')}
        >
          🔄 Hybrid WebSocket + SSE
        </button>
        <button 
          className={activeExample === 'robust' ? 'active' : ''}
          onClick={() => setActiveExample('robust')}
        >
          🛡️ Robuste Verbindung
        </button>
      </div>

      {/* Aktives Beispiel */}
      <div className="example-content">
        {examples[activeExample as keyof typeof examples]}
      </div>

      {/* CSS-Styles (inline für Beispiel) */}
      <style jsx>{`
        .sse-client-examples {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .example-nav {
          display: flex;
          gap: 10px;
          margin-bottom: 30px;
          border-bottom: 1px solid #eee;
          padding-bottom: 15px;
        }
        
        .example-nav button {
          padding: 10px 20px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .example-nav button.active {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }
        
        .connection-status, .client-status {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: flex;
          gap: 20px;
          align-items: center;
        }
        
        .status-indicator.connected {
          color: #28a745;
        }
        
        .status-indicator.disconnected {
          color: #dc3545;
        }
        
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 30px;
        }
        
        .metric-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
        }
        
        .metric-value {
          font-size: 2em;
          font-weight: bold;
          color: #007bff;
          margin-top: 10px;
        }
        
        .frame-list {
          max-height: 200px;
          overflow-y: auto;
          border: 1px solid #ddd;
          border-radius: 5px;
        }
        
        .frame-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          border-bottom: 1px solid #eee;
          font-family: monospace;
          font-size: 0.9em;
        }
        
        .frame-type {
          font-weight: bold;
          color: #007bff;
        }
      `}</style>
    </div>
  );
};

export default SSEClientExamples;
