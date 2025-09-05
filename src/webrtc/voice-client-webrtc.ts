/**
 * WebRTC-erweiterte VoiceClient-Integration
 * 
 * Erweitert die bestehende VoiceClient-Klasse um WebRTC-Unterstützung
 * mit automatischem Fallback zu WebSocket bei Verbindungsproblemen.
 * 
 * @version 1.0.0
 */

import type { VoiceConfiguration } from '@/store';
import type { Update } from '@/store/voice-client';
import { TransportManager, createTransportManager } from './transport-manager';
import type { WebRTCEventMap, WebRTCPerformanceMetrics } from './types';

// =============================================================================
// Enhanced Voice Client Configuration
// =============================================================================

export interface EnhancedVoiceConfiguration extends VoiceConfiguration {
  /** WebRTC-spezifische Einstellungen */
  webrtc?: {
    /** STUN/TURN Server URLs */
    iceServers?: string[];
    /** Audio-Qualität */
    audioQuality?: 'low-latency' | 'balanced' | 'high-quality';
    /** Fallback aktiviert */
    enableFallback?: boolean;
    /** Fallback Timeout in ms */
    fallbackTimeout?: number;
    /** Debug Logging */
    enableDebugLogging?: boolean;
  };
}

// =============================================================================
// WebRTC Voice Client Events
// =============================================================================

export interface WebRTCVoiceClientEvents extends WebRTCEventMap {
  'transport-change': { transportType: 'webrtc' | 'websocket'; state: any };
  'transport-fallback': { from: string; to: string; reason: string };
  'audio-quality-change': { quality: 'excellent' | 'good' | 'fair' | 'poor' };
  'connection-quality-change': { latency: number; packetLoss: number; bitrate: number };
}

// =============================================================================
// Enhanced Voice Client
// =============================================================================

export class WebRTCVoiceClient {
  private transportManager: TransportManager;
  private handleServerMessage: (update: Update) => Promise<void>;
  private setAnalyzer: (analyzer: AnalyserNode) => void;
  private config: EnhancedVoiceConfiguration;
  
  private isStarted: boolean = false;
  private currentDeviceId: string | null = null;
  private listeners: Map<string, Function[]> = new Map();
  
  // Audio Processing
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioProcessor: AudioWorkletNode | null = null;
  private analyzerNode: AnalyserNode | null = null;
  
  // Performance Monitoring
  private performanceMetrics: WebRTCPerformanceMetrics | null = null;
  private qualityMonitorInterval: NodeJS.Timeout | null = null;

  constructor(
    baseUrl: string,
    handleServerMessage: (update: Update) => Promise<void>,
    setAnalyzer: (analyzer: AnalyserNode) => void,
    config: EnhancedVoiceConfiguration
  ) {
    this.handleServerMessage = handleServerMessage;
    this.setAnalyzer = setAnalyzer;
    this.config = config;
    
    // Transport Manager konfigurieren
    const sessionId = this.generateSessionId();
    const userId = this.extractUserIdFromUrl(baseUrl);
    const websocketUrl = baseUrl;
    const webrtcSignalingUrl = this.buildWebRTCSignalingUrl(baseUrl);
    
    this.transportManager = createTransportManager(
      sessionId,
      userId,
      websocketUrl,
      webrtcSignalingUrl,
      {
        preferredTransport: config.transport || 'webrtc',
        enableFallback: config.webrtc?.enableFallback !== false,
        fallbackTimeout: config.webrtc?.fallbackTimeout || 10000,
        enableDebugLogging: config.webrtc?.enableDebugLogging || false,
        webrtcConfig: {
          audioConfig: {
            sampleRate: 48000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            deviceId: config.inputDeviceId !== 'default' ? config.inputDeviceId : undefined,
            latency: 'interactive'
          }
        }
      }
    );
    
    this.setupTransportEventHandlers();
    this.log('debug', 'WebRTC Voice Client initialisiert', { config });
  }

  // =============================================================================
  // Public API - Kompatibel mit bestehender VoiceClient
  // =============================================================================

  /**
   * Voice Client starten
   */
  async start(deviceId: string | null = null): Promise<void> {
    if (this.isStarted) {
      this.log('warn', 'Voice Client bereits gestartet');
      return;
    }

    try {
      this.log('info', 'Starte WebRTC Voice Client', { deviceId });
      
      this.currentDeviceId = deviceId;
      
      // Audio Context und Processing Setup
      await this.setupAudioProcessing(deviceId);
      
      // Transport-Verbindung herstellen
      await this.transportManager.connect();
      
      // Performance Monitoring starten
      this.startPerformanceMonitoring();
      
      this.isStarted = true;
      
      this.log('info', 'WebRTC Voice Client erfolgreich gestartet');
      
    } catch (error) {
      this.log('error', 'Fehler beim Starten des Voice Clients', { error });
      throw error;
    }
  }

  /**
   * Voice Client stoppen
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.log('info', 'Stoppe WebRTC Voice Client');
    
    this.isStarted = false;
    
    // Performance Monitoring stoppen
    this.stopPerformanceMonitoring();
    
    // Audio Processing cleanup
    await this.cleanupAudioProcessing();
    
    // Transport trennen
    await this.transportManager.disconnect();
    
    this.log('info', 'WebRTC Voice Client gestoppt');
  }

  /**
   * Message senden (kompatibel mit bestehender API)
   */
  send(update: Update): void {
    if (!this.isStarted) {
      this.log('warn', 'Voice Client nicht gestartet, Message wird ignoriert');
      return;
    }

    this.transportManager.sendMessage(update).catch(error => {
      this.log('error', 'Fehler beim Senden der Message', { error, update });
    });
  }

  /**
   * Mikrofon stummschalten
   */
  mute_microphone(): void {
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
      this.log('debug', 'Mikrofon stummgeschaltet');
    }
  }

  /**
   * Mikrofon aktivieren
   */
  unmute_microphone(): void {
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
      this.log('debug', 'Mikrofon aktiviert');
    }
  }

  // =============================================================================
  // WebRTC-spezifische Public API
  // =============================================================================

  /**
   * Aktueller Transport Type
   */
  getCurrentTransportType(): 'webrtc' | 'websocket' | null {
    return this.transportManager.getCurrentTransportType();
  }

  /**
   * Performance Metrics abrufen
   */
  getPerformanceMetrics(): WebRTCPerformanceMetrics | null {
    return this.performanceMetrics;
  }

  /**
   * Verbindungsqualität abrufen
   */
  getConnectionQuality(): 'excellent' | 'good' | 'fair' | 'poor' {
    if (!this.performanceMetrics) {
      return 'poor';
    }

    const { currentLatency, audioQuality } = this.performanceMetrics;
    const packetLoss = audioQuality.packetLossRate;

    if (currentLatency < 50 && packetLoss < 0.01) {
      return 'excellent';
    } else if (currentLatency < 100 && packetLoss < 0.03) {
      return 'good';
    } else if (currentLatency < 200 && packetLoss < 0.05) {
      return 'fair';
    } else {
      return 'poor';
    }
  }

  /**
   * Manueller Fallback zu WebSocket
   */
  async fallbackToWebSocket(): Promise<void> {
    await this.transportManager.fallbackToWebSocket();
  }

  /**
   * Manueller Upgrade zu WebRTC
   */
  async upgradeToWebRTC(): Promise<void> {
    await this.transportManager.upgradeToWebRTC();
  }

  /**
   * Event Listener registrieren
   */
  on<K extends keyof WebRTCVoiceClientEvents>(
    event: K, 
    listener: (data: WebRTCVoiceClientEvents[K]) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  /**
   * Event Listener entfernen
   */
  off<K extends keyof WebRTCVoiceClientEvents>(
    event: K, 
    listener: (data: WebRTCVoiceClientEvents[K]) => void
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  /**
   * Ist verbunden
   */
  isConnected(): boolean {
    return this.transportManager.isConnected();
  }

  // =============================================================================
  // Private Methods - Audio Processing
  // =============================================================================

  private async setupAudioProcessing(deviceId: string | null): Promise<void> {
    try {
      // Audio Context erstellen
      this.audioContext = new AudioContext({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });

      // Media Stream erstellen
      const constraints: MediaStreamConstraints = {
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined
        },
        video: false
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Audio Worklet für Processing laden
      await this.audioContext.audioWorklet.addModule('/worklets/webrtc-audio-worklet.js');

      // Audio Processing Chain aufbauen
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Analyzer Node für Visualisierung
      this.analyzerNode = this.audioContext.createAnalyser();
      this.analyzerNode.fftSize = 256;
      this.setAnalyzer(this.analyzerNode);

      // Audio Processor für WebRTC
      this.audioProcessor = new AudioWorkletNode(this.audioContext, 'webrtc-audio-processor', {
        processorOptions: {
          sampleRate: 48000,
          channelCount: 1
        }
      });

      // Audio Chain verbinden
      source.connect(this.analyzerNode);
      this.analyzerNode.connect(this.audioProcessor);

      // Audio-Daten an Transport weiterleiten
      this.audioProcessor.port.onmessage = (event) => {
        if (event.data.type === 'audio-data') {
          this.transportManager.sendAudio(event.data.audioData).catch(error => {
            this.log('error', 'Fehler beim Senden von Audio-Daten', { error });
          });
        }
      };

      this.log('info', 'Audio Processing Setup abgeschlossen');

    } catch (error) {
      this.log('error', 'Fehler beim Audio Processing Setup', { error });
      throw error;
    }
  }

  private async cleanupAudioProcessing(): Promise<void> {
    // Media Stream stoppen
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Audio Context schließen
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    // Nodes cleanup
    this.audioProcessor = null;
    this.analyzerNode = null;

    this.log('debug', 'Audio Processing Cleanup abgeschlossen');
  }

  // =============================================================================
  // Private Methods - Transport Event Handling
  // =============================================================================

  private setupTransportEventHandlers(): void {
    // Transport-Wechsel Events
    this.transportManager.on('transport-change', (data) => {
      this.log('info', 'Transport gewechselt', { transportType: data.transportType });
      this.emit('transport-change', data);
    });

    this.transportManager.on('transport-fallback', (data) => {
      this.log('warn', 'Transport Fallback', { from: data.from, to: data.to, reason: data.reason });
      this.emit('transport-fallback', data);
    });

    // Connection State Events
    this.transportManager.on('connection-state-change', (data) => {
      this.log('debug', 'Connection State geändert', { state: data.state });
    });

    // Audio Events
    this.transportManager.on('audio-track-added', (data) => {
      this.log('info', 'Remote Audio Track hinzugefügt');
      this.handleRemoteAudioTrack(data.track, data.stream);
    });

    // Message Events
    this.transportManager.on('message-received', (data) => {
      this.handleServerMessage(data.message).catch(error => {
        this.log('error', 'Fehler beim Verarbeiten der Server Message', { error });
      });
    });

    // Error Events
    this.transportManager.on('error', (data) => {
      this.log('error', 'Transport Error', { error: data.error, context: data.context });
    });

    // Performance Events
    this.transportManager.on('metrics-update', (data) => {
      this.performanceMetrics = data.metrics;
      this.checkConnectionQuality();
    });
  }

  private handleRemoteAudioTrack(track: MediaStreamTrack, stream: MediaStream): void {
    try {
      // Remote Audio für Playback einrichten
      const audioElement = new Audio();
      audioElement.srcObject = stream;
      audioElement.autoplay = true;
      audioElement.muted = false;

      this.log('info', 'Remote Audio Track für Playback eingerichtet');

    } catch (error) {
      this.log('error', 'Fehler beim Einrichten des Remote Audio Tracks', { error });
    }
  }

  // =============================================================================
  // Private Methods - Performance Monitoring
  // =============================================================================

  private startPerformanceMonitoring(): void {
    this.qualityMonitorInterval = setInterval(() => {
      this.checkConnectionQuality();
    }, 2000);

    this.log('debug', 'Performance Monitoring gestartet');
  }

  private stopPerformanceMonitoring(): void {
    if (this.qualityMonitorInterval) {
      clearInterval(this.qualityMonitorInterval);
      this.qualityMonitorInterval = null;
    }

    this.log('debug', 'Performance Monitoring gestoppt');
  }

  private checkConnectionQuality(): void {
    if (!this.performanceMetrics) return;

    const quality = this.getConnectionQuality();
    const { currentLatency, audioQuality } = this.performanceMetrics;

    // Quality Change Event emittieren
    this.emit('audio-quality-change', { quality });

    // Connection Quality Event emittieren
    this.emit('connection-quality-change', {
      latency: currentLatency,
      packetLoss: audioQuality.packetLossRate,
      bitrate: audioQuality.bitrate
    });

    // Automatischer Fallback bei schlechter Qualität
    if (quality === 'poor' && this.getCurrentTransportType() === 'webrtc') {
      this.log('warn', 'Schlechte WebRTC-Qualität erkannt, erwäge Fallback');

      // Fallback nur nach mehreren schlechten Messungen
      // (Implementierung einer Hysterese zur Vermeidung von Flapping)
    }
  }

  // =============================================================================
  // Private Methods - Utilities
  // =============================================================================

  private generateSessionId(): string {
    return `webrtc-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractUserIdFromUrl(url: string): string {
    // Extrahiert User ID aus URL wie "/api/voice/{user_id}"
    const match = url.match(/\/api\/voice\/([^\/\?]+)/);
    return match ? match[1] : 'unknown-user';
  }

  private buildWebRTCSignalingUrl(baseUrl: string): string {
    // Konvertiert WebSocket URL zu WebRTC Signaling URL
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/webrtc-signaling`;
  }

  private emit<K extends keyof WebRTCVoiceClientEvents>(
    event: K,
    data: WebRTCVoiceClientEvents[K]
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          this.log('error', `Fehler in Event Listener für ${event}`, { error });
        }
      });
    }
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (!this.config.webrtc?.enableDebugLogging && level === 'debug') {
      return;
    }

    const logMessage = `[WebRTC Voice Client] ${message}`;

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
// Factory Function
// =============================================================================

/**
 * Erstellt WebRTC Voice Client mit automatischem Fallback
 */
export function createWebRTCVoiceClient(
  baseUrl: string,
  handleServerMessage: (update: Update) => Promise<void>,
  setAnalyzer: (analyzer: AnalyserNode) => void,
  config: EnhancedVoiceConfiguration
): WebRTCVoiceClient {
  return new WebRTCVoiceClient(baseUrl, handleServerMessage, setAnalyzer, config);
}
