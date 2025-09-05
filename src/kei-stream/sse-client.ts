/**
 * KEI-Stream Server-Sent Events (SSE) Client
 * 
 * Browser-optimierte SSE-Implementation für KEI-Stream mit:
 * - EventSource-basierte Verbindung zu Backend SSE-Endpunkten
 * - Event-Listener-Management kompatibel mit WebSocket-Client
 * - Automatische Reconnection mit exponential backoff
 * - Read-only Stream-Monitoring und Progress-Tracking
 * 
 * @version 1.0.0
 */

import {
  KEIStreamFrame,
  FrameType,
  KEIStreamListener,
  ConnectionState,
  KEIStreamClientConfig,
} from './types';

/**
 * Konfiguration für KEI-Stream SSE-Client
 */
export interface KEIStreamSSEConfig {
  /** Basis-URL für SSE-Endpunkte (z.B. http://localhost:8000/stream/sse) */
  baseUrl: string;
  /** Session-ID für die Verbindung */
  sessionId: string;
  /** Stream-ID für spezifischen Stream */
  streamId: string;
  /** Automatische Reconnection aktivieren */
  autoReconnect?: boolean;
  /** Initiale Reconnect-Verzögerung in ms */
  reconnectInitialMs?: number;
  /** Maximale Reconnect-Verzögerung in ms */
  reconnectMaxMs?: number;
  /** Maximale Anzahl Reconnect-Versuche */
  maxReconnectAttempts?: number;
}

/**
 * SSE-Client-Status für Monitoring
 */
export interface KEIStreamSSEStatus {
  connectionState: ConnectionState;
  reconnectAttempts: number;
  totalFramesReceived: number;
  lastFrameTimestamp?: string;
  streamId: string;
  sessionId: string;
}

/**
 * KEI-Stream SSE-Client für Read-only Stream-Monitoring
 * 
 * Dieser Client stellt eine EventSource-basierte Verbindung zu KEI-Stream
 * SSE-Endpunkten bereit und ist vollständig kompatibel mit der bestehenden
 * KEI-Stream-Architektur.
 */
export class KEIStreamSSEClient {
  private eventSource?: EventSource;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private config: Required<KEIStreamSSEConfig>;
  
  // Event-Listener-Management (kompatibel mit WebSocket-Client)
  private listeners: Set<KEIStreamListener> = new Set();
  private frameTypeListeners: Map<FrameType, Set<KEIStreamListener>> = new Map();
  
  // Reconnection-Management
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private shouldStop = false;
  
  // Statistiken
  private totalFramesReceived = 0;
  private lastFrameTimestamp?: string;

  constructor(config: KEIStreamSSEConfig) {
    this.config = {
      autoReconnect: true,
      reconnectInitialMs: 1000,
      reconnectMaxMs: 30000,
      maxReconnectAttempts: 10,
      ...config,
    };
  }

  /**
   * Startet SSE-Verbindung zum Backend
   */
  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTED || 
        this.connectionState === ConnectionState.CONNECTING) {
      return;
    }

    this.connectionState = ConnectionState.CONNECTING;
    this.shouldStop = false;

    try {
      const url = `${this.config.baseUrl}/${this.config.sessionId}/${this.config.streamId}`;
      this.eventSource = new EventSource(url);

      // Event-Handler konfigurieren
      this.eventSource.onopen = () => {
        this.connectionState = ConnectionState.CONNECTED;
        this.reconnectAttempts = 0;
        this.emit('connected');
      };

      this.eventSource.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.eventSource.onerror = (error) => {
        this.handleError(error);
      };

    } catch (error) {
      this.connectionState = ConnectionState.ERROR;
      this.emit('error', error as Error);
      
      if (this.config.autoReconnect && !this.shouldStop) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Beendet SSE-Verbindung
   */
  async disconnect(): Promise<void> {
    this.shouldStop = true;
    this.clearReconnectTimer();
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    
    this.connectionState = ConnectionState.DISCONNECTED;
    this.emit('disconnected');
  }

  /**
   * Zerstört Client und bereinigt Ressourcen
   */
  destroy(): void {
    this.disconnect();
    this.listeners.clear();
    this.frameTypeListeners.clear();
  }

  /**
   * Registriert Listener für alle Frames
   */
  on(listener: KEIStreamListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Registriert Listener für spezifischen Frame-Typ
   */
  onFrameType(frameType: FrameType, listener: KEIStreamListener): () => void {
    if (!this.frameTypeListeners.has(frameType)) {
      this.frameTypeListeners.set(frameType, new Set());
    }
    this.frameTypeListeners.get(frameType)!.add(listener);
    
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

  /**
   * Gibt aktuellen Client-Status zurück
   */
  getStatus(): KEIStreamSSEStatus {
    return {
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      totalFramesReceived: this.totalFramesReceived,
      lastFrameTimestamp: this.lastFrameTimestamp,
      streamId: this.config.streamId,
      sessionId: this.config.sessionId,
    };
  }

  /**
   * Prüft ob Client verbunden ist
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  /**
   * Verarbeitet eingehende SSE-Messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const frame: KEIStreamFrame = JSON.parse(event.data);
      
      // Statistiken aktualisieren
      this.totalFramesReceived++;
      this.lastFrameTimestamp = frame.ts || new Date().toISOString();
      
      // Frame an alle Listener weiterleiten
      this.emitFrame(frame);
      
    } catch (error) {
      console.error('Fehler beim Parsen der SSE-Message:', error);
      this.emit('error', new Error(`SSE Message Parse Error: ${error}`));
    }
  }

  /**
   * Behandelt SSE-Verbindungsfehler
   */
  private handleError(error: Event): void {
    this.connectionState = ConnectionState.ERROR;
    this.emit('error', new Error('SSE Connection Error'));
    
    if (this.config.autoReconnect && !this.shouldStop) {
      this.scheduleReconnect();
    }
  }

  /**
   * Sendet Frame an alle registrierten Listener
   */
  private emitFrame(frame: KEIStreamFrame): void {
    // Globale Listener benachrichtigen
    this.listeners.forEach(listener => {
      try {
        listener(frame);
      } catch (error) {
        console.error('Fehler in Frame-Listener:', error);
      }
    });

    // Frame-Typ-spezifische Listener benachrichtigen
    const typeListeners = this.frameTypeListeners.get(frame.type as FrameType);
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

  /**
   * Sendet Event an Event-Listener
   */
  private emit(event: string, data?: any): void {
    // Kompatibilität mit WebSocket-Client Event-System
    // Hier könnten zusätzliche Event-Emitter-Funktionen implementiert werden
    console.debug(`SSE Event: ${event}`, data);
  }

  /**
   * Plant automatische Wiederverbindung
   */
  private scheduleReconnect(): void {
    if (this.shouldStop || 
        this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return;
    }

    this.clearReconnectTimer();
    
    const delay = Math.min(
      this.config.reconnectInitialMs * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxMs
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Löscht Reconnect-Timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}

/**
 * Factory-Funktion für SSE-Client mit Standard-Konfiguration
 */
export function createSSEClient(
  sessionId: string,
  streamId: string,
  baseUrl: string = 'http://localhost:8000/stream/sse'
): KEIStreamSSEClient {
  return new KEIStreamSSEClient({
    baseUrl,
    sessionId,
    streamId,
    autoReconnect: true,
    reconnectInitialMs: 1000,
    reconnectMaxMs: 30000,
    maxReconnectAttempts: 10,
  });
}
