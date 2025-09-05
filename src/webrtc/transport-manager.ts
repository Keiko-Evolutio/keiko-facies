/**
 * Transport Manager für Voice-Service-System
 * 
 * Verwaltet WebRTC und WebSocket Transports mit automatischem Fallback.
 * Bietet einheitliche API für Audio-Kommunikation unabhängig vom Transport.
 * 
 * @version 1.0.0
 */

import type { 
  AudioTransport, 
  WebRTCClientConfig, 
  WebRTCEventMap,
  WebRTCClientState,
  WebRTCPerformanceMetrics 
} from './types';
import { WebRTCClient } from './webrtc-client';
import { createWebRTCClientConfig } from './config';
import { WebRTCError, WebRTCConnectionError } from './types';

// =============================================================================
// WebSocket Transport Wrapper
// =============================================================================

class WebSocketTransport implements AudioTransport {
  readonly type = 'websocket' as const;
  
  private websocket: WebSocket | null = null;
  private url: string;
  private listeners: Map<string, Function[]> = new Map();
  private isConnected: boolean = false;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(this.url);
        
        this.websocket.onopen = () => {
          this.isConnected = true;
          this.emit('connection-state-change', { 
            state: 'connected', 
            previousState: 'connecting' 
          });
          resolve();
        };
        
        this.websocket.onerror = (error) => {
          this.emit('error', { error: new Error('WebSocket connection error') });
          reject(error);
        };
        
        this.websocket.onclose = () => {
          this.isConnected = false;
          this.emit('connection-state-change', { 
            state: 'disconnected', 
            previousState: 'connected' 
          });
        };
        
        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.emit('message-received', { message: data });
          } catch (error) {
            console.error('Fehler beim Parsen der WebSocket Message:', error);
          }
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.isConnected = false;
  }

  async sendAudio(audioData: ArrayBuffer): Promise<void> {
    if (!this.websocket || !this.isConnected) {
      throw new Error('WebSocket nicht verbunden');
    }
    
    // Audio als Base64 senden (kompatibel mit bestehender WebSocket-Implementierung)
    const base64 = btoa(String.fromCharCode(...new Uint8Array(audioData)));
    this.websocket.send(JSON.stringify({
      type: 'audio',
      content: base64
    }));
  }

  async sendMessage(message: any): Promise<void> {
    if (!this.websocket || !this.isConnected) {
      throw new Error('WebSocket nicht verbunden');
    }
    
    this.websocket.send(JSON.stringify(message));
  }

  on<K extends keyof WebRTCEventMap>(event: K, listener: (data: WebRTCEventMap[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off<K extends keyof WebRTCEventMap>(event: K, listener: (data: WebRTCEventMap[K]) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  getState(): WebRTCClientState {
    return {
      connectionState: this.isConnected ? 'connected' : 'disconnected',
      signalingState: 'stable',
      iceConnectionState: 'new',
      iceGatheringState: 'new',
      isConnected: this.isConnected,
      lastConnected: null,
      lastDisconnected: null,
      reconnectAttempts: 0,
      maxReconnectAttempts: 0,
      error: null,
      audioTracks: [],
      remoteAudioTracks: []
    };
  }

  getMetrics(): WebRTCPerformanceMetrics {
    return {
      connectionSetupTime: 0,
      iceGatheringTime: 0,
      dtlsHandshakeTime: 0,
      audioQuality: {
        bitrate: 0,
        packetLossRate: 0,
        roundTripTime: 0,
        jitter: 0,
        audioLevel: 0,
        codec: 'websocket',
        timestamp: Date.now()
      },
      bytesSent: 0,
      bytesReceived: 0,
      packetsSent: 0,
      packetsReceived: 0,
      packetsLost: 0,
      currentLatency: 0,
      averageLatency: 0
    };
  }

  private emit<K extends keyof WebRTCEventMap>(event: K, data: WebRTCEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Fehler in WebSocket Event Listener für ${event}:`, error);
        }
      });
    }
  }
}

// =============================================================================
// Transport Manager Configuration
// =============================================================================

export interface TransportManagerConfig {
  /** Bevorzugter Transport */
  preferredTransport: 'webrtc' | 'websocket';
  /** WebRTC Konfiguration */
  webrtcConfig?: Partial<WebRTCClientConfig>;
  /** WebSocket URL */
  websocketUrl: string;
  /** WebRTC Signaling URL */
  webrtcSignalingUrl: string;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Automatischer Fallback aktiviert */
  enableFallback: boolean;
  /** Fallback Timeout in ms */
  fallbackTimeout: number;
  /** Debug Logging aktiviert */
  enableDebugLogging: boolean;
}

// =============================================================================
// Transport Manager
// =============================================================================

export class TransportManager {
  private config: TransportManagerConfig;
  private currentTransport: AudioTransport | null = null;
  private webrtcTransport: WebRTCClient | null = null;
  private websocketTransport: WebSocketTransport | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private fallbackTimer: NodeJS.Timeout | null = null;

  constructor(config: TransportManagerConfig) {
    this.config = config;
    this.log('debug', 'Transport Manager initialisiert', { config });
  }

  // =============================================================================
  // Public API
  // =============================================================================

  /**
   * Verbindung mit bevorzugtem Transport herstellen
   */
  async connect(): Promise<void> {
    this.log('info', 'Starte Transport-Verbindung', { 
      preferred: this.config.preferredTransport 
    });

    if (this.config.preferredTransport === 'webrtc') {
      await this.connectWithWebRTC();
    } else {
      await this.connectWithWebSocket();
    }
  }

  /**
   * Verbindung trennen
   */
  async disconnect(): Promise<void> {
    this.log('info', 'Trenne Transport-Verbindung');
    
    this.clearFallbackTimer();
    
    if (this.currentTransport) {
      await this.currentTransport.disconnect();
      this.currentTransport = null;
    }
    
    if (this.webrtcTransport) {
      await this.webrtcTransport.disconnect();
      this.webrtcTransport = null;
    }
    
    if (this.websocketTransport) {
      await this.websocketTransport.disconnect();
      this.websocketTransport = null;
    }
  }

  /**
   * Audio-Daten senden
   */
  async sendAudio(audioData: ArrayBuffer): Promise<void> {
    if (!this.currentTransport) {
      throw new Error('Kein Transport verfügbar');
    }
    
    return this.currentTransport.sendAudio(audioData);
  }

  /**
   * Message senden
   */
  async sendMessage(message: any): Promise<void> {
    if (!this.currentTransport) {
      throw new Error('Kein Transport verfügbar');
    }
    
    return this.currentTransport.sendMessage(message);
  }

  /**
   * Event Listener registrieren
   */
  on<K extends keyof WebRTCEventMap>(event: K, listener: (data: WebRTCEventMap[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    
    // Event auch an aktuellen Transport weiterleiten
    if (this.currentTransport) {
      this.currentTransport.on(event, listener);
    }
  }

  /**
   * Event Listener entfernen
   */
  off<K extends keyof WebRTCEventMap>(event: K, listener: (data: WebRTCEventMap[K]) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
    
    // Event auch vom aktuellen Transport entfernen
    if (this.currentTransport) {
      this.currentTransport.off(event, listener);
    }
  }

  /**
   * Aktueller Transport Type
   */
  getCurrentTransportType(): 'webrtc' | 'websocket' | null {
    return this.currentTransport?.type || null;
  }

  /**
   * Transport State
   */
  getState(): WebRTCClientState | null {
    return this.currentTransport?.getState() || null;
  }

  /**
   * Transport Metrics
   */
  getMetrics(): WebRTCPerformanceMetrics | null {
    return this.currentTransport?.getMetrics() || null;
  }

  /**
   * Ist verbunden
   */
  isConnected(): boolean {
    return this.currentTransport?.getState().isConnected || false;
  }

  /**
   * Manueller Fallback zu WebSocket
   */
  async fallbackToWebSocket(): Promise<void> {
    this.log('info', 'Manueller Fallback zu WebSocket');
    await this.performFallbackToWebSocket();
  }

  /**
   * Manueller Upgrade zu WebRTC
   */
  async upgradeToWebRTC(): Promise<void> {
    this.log('info', 'Manueller Upgrade zu WebRTC');
    await this.connectWithWebRTC();
  }

  // =============================================================================
  // Private Methods - Connection Management
  // =============================================================================

  private async connectWithWebRTC(): Promise<void> {
    try {
      this.log('info', 'Versuche WebRTC-Verbindung');

      // WebRTC Client erstellen falls nicht vorhanden
      if (!this.webrtcTransport) {
        const webrtcConfig = createWebRTCClientConfig(
          this.config.sessionId,
          this.config.userId,
          this.config.webrtcSignalingUrl,
          {
            customConfig: this.config.webrtcConfig
          }
        );

        this.webrtcTransport = new WebRTCClient(webrtcConfig);
        this.setupTransportEventHandlers(this.webrtcTransport);
      }

      // Fallback Timer starten falls aktiviert
      if (this.config.enableFallback) {
        this.startFallbackTimer();
      }

      // WebRTC Verbindung herstellen
      await this.webrtcTransport.connect();

      // Erfolgreiche Verbindung
      this.clearFallbackTimer();
      this.setCurrentTransport(this.webrtcTransport);

      this.log('info', 'WebRTC-Verbindung erfolgreich hergestellt');

    } catch (error) {
      this.log('error', 'WebRTC-Verbindung fehlgeschlagen', { error });

      if (this.config.enableFallback) {
        this.log('info', 'Fallback zu WebSocket nach WebRTC-Fehler');
        await this.performFallbackToWebSocket();
      } else {
        throw error;
      }
    }
  }

  private async connectWithWebSocket(): Promise<void> {
    try {
      this.log('info', 'Versuche WebSocket-Verbindung');

      // WebSocket Transport erstellen falls nicht vorhanden
      if (!this.websocketTransport) {
        this.websocketTransport = new WebSocketTransport(this.config.websocketUrl);
        this.setupTransportEventHandlers(this.websocketTransport);
      }

      // WebSocket Verbindung herstellen
      await this.websocketTransport.connect();

      this.setCurrentTransport(this.websocketTransport);

      this.log('info', 'WebSocket-Verbindung erfolgreich hergestellt');

    } catch (error) {
      this.log('error', 'WebSocket-Verbindung fehlgeschlagen', { error });
      throw error;
    }
  }

  private async performFallbackToWebSocket(): Promise<void> {
    try {
      this.clearFallbackTimer();

      // Aktuelle WebRTC-Verbindung trennen falls vorhanden
      if (this.webrtcTransport && this.currentTransport === this.webrtcTransport) {
        await this.webrtcTransport.disconnect();
      }

      // WebSocket-Verbindung herstellen
      await this.connectWithWebSocket();

      this.emit('transport-fallback', {
        from: 'webrtc',
        to: 'websocket',
        reason: 'connection-timeout-or-error'
      });

    } catch (error) {
      this.log('error', 'Fallback zu WebSocket fehlgeschlagen', { error });
      throw new WebRTCConnectionError('Alle Transport-Optionen fehlgeschlagen', { error });
    }
  }

  private setCurrentTransport(transport: AudioTransport): void {
    // Event Handlers von altem Transport entfernen
    if (this.currentTransport) {
      this.removeTransportEventHandlers(this.currentTransport);
    }

    this.currentTransport = transport;

    // Event Handlers zu neuem Transport hinzufügen
    this.setupTransportEventHandlers(transport);

    this.emit('transport-change', {
      transportType: transport.type,
      state: transport.getState()
    });
  }

  private setupTransportEventHandlers(transport: AudioTransport): void {
    // Alle registrierten Event Listener zum Transport hinzufügen
    for (const [event, listeners] of this.listeners) {
      listeners.forEach(listener => {
        transport.on(event as any, listener);
      });
    }

    // Transport-spezifische Events weiterleiten
    transport.on('connection-state-change', (data) => {
      this.emit('connection-state-change', data);
    });

    transport.on('error', (data) => {
      this.emit('error', data);

      // Bei WebRTC-Fehler automatischer Fallback falls aktiviert
      if (transport.type === 'webrtc' && this.config.enableFallback) {
        this.log('warn', 'WebRTC-Fehler erkannt, starte Fallback');
        this.performFallbackToWebSocket().catch(fallbackError => {
          this.log('error', 'Fallback nach WebRTC-Fehler fehlgeschlagen', { fallbackError });
        });
      }
    });
  }

  private removeTransportEventHandlers(transport: AudioTransport): void {
    // Alle Event Listener vom Transport entfernen
    for (const [event, listeners] of this.listeners) {
      listeners.forEach(listener => {
        transport.off(event as any, listener);
      });
    }
  }

  private startFallbackTimer(): void {
    this.clearFallbackTimer();

    this.fallbackTimer = setTimeout(() => {
      this.log('warn', 'WebRTC-Verbindung Timeout, starte Fallback zu WebSocket');
      this.performFallbackToWebSocket().catch(error => {
        this.log('error', 'Fallback nach Timeout fehlgeschlagen', { error });
      });
    }, this.config.fallbackTimeout);
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  // =============================================================================
  // Private Methods - Event Management
  // =============================================================================

  private emit<K extends keyof WebRTCEventMap>(event: K, data: WebRTCEventMap[K]): void;
  private emit(event: string, data: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          this.log('error', `Fehler in Transport Manager Event Listener für ${event}`, { error });
        }
      });
    }
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (!this.config.enableDebugLogging && level === 'debug') {
      return;
    }

    const logMessage = `[Transport Manager] ${message}`;

    switch (level) {
      case 'debug':
        console.debug(logMessage, data);
        break;
      case 'info':
        console.info(logMessage, data);
        break;
      case 'warn':
        console.warn(logMessage, data);
        break;
      case 'error':
        console.error(logMessage, data);
        break;
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Erstellt Transport Manager mit Standard-Konfiguration
 */
export function createTransportManager(
  sessionId: string,
  userId: string,
  websocketUrl: string,
  webrtcSignalingUrl: string,
  options: {
    preferredTransport?: 'webrtc' | 'websocket';
    enableFallback?: boolean;
    fallbackTimeout?: number;
    webrtcConfig?: Partial<WebRTCClientConfig>;
    enableDebugLogging?: boolean;
  } = {}
): TransportManager {
  const config: TransportManagerConfig = {
    preferredTransport: options.preferredTransport || 'webrtc',
    websocketUrl,
    webrtcSignalingUrl,
    sessionId,
    userId,
    enableFallback: options.enableFallback !== false, // Default: true
    fallbackTimeout: options.fallbackTimeout || 10000, // 10 Sekunden
    enableDebugLogging: options.enableDebugLogging || false,
    webrtcConfig: options.webrtcConfig
  };

  return new TransportManager(config);
}
