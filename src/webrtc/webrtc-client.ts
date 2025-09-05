/**
 * WebRTC Client für Voice-Service-System
 * 
 * Hauptklasse für WebRTC-basierte P2P-Audio-Kommunikation.
 * Integriert Signaling, PeerConnection Management und Audio-Processing.
 * 
 * @version 1.0.0
 */

import type { 
  WebRTCClientConfig,
  WebRTCClientState,
  WebRTCPerformanceMetrics,
  AudioQualityMetrics,
  WebRTCEventMap,
  AudioTransport,
  WebRTCConnectionState
} from './types';
import { WebRTCSignalingClient } from './signaling-client';
import { manipulateSDPForCodecs } from './config';
import { WebRTCError, WebRTCConnectionError, WebRTCAudioError } from './types';

// =============================================================================
// WebRTC Client Implementation
// =============================================================================

export class WebRTCClient implements AudioTransport {
  readonly type = 'webrtc' as const;
  
  private config: WebRTCClientConfig;
  private signalingClient: WebRTCSignalingClient;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private dataChannel: RTCDataChannel | null = null;
  
  private state: WebRTCClientState;
  private metrics: WebRTCPerformanceMetrics;
  private listeners: Map<string, Function[]> = new Map();
  
  private connectionStartTime: number = 0;
  private iceGatheringStartTime: number = 0;
  private dtlsHandshakeStartTime: number = 0;
  
  private metricsInterval: NodeJS.Timeout | null = null;
  private qualityCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: WebRTCClientConfig) {
    this.config = config;
    
    // Initialisiere State
    this.state = {
      connectionState: 'disconnected',
      signalingState: 'stable',
      iceConnectionState: 'new',
      iceGatheringState: 'new',
      isConnected: false,
      lastConnected: null,
      lastDisconnected: null,
      reconnectAttempts: 0,
      maxReconnectAttempts: config.maxReconnectAttempts,
      error: null,
      audioTracks: [],
      remoteAudioTracks: []
    };
    
    // Initialisiere Metrics
    this.metrics = {
      connectionSetupTime: 0,
      iceGatheringTime: 0,
      dtlsHandshakeTime: 0,
      audioQuality: {
        bitrate: 0,
        packetLossRate: 0,
        roundTripTime: 0,
        jitter: 0,
        audioLevel: 0,
        codec: '',
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
    
    // Initialisiere Signaling Client
    this.signalingClient = new WebRTCSignalingClient({
      url: config.signalingUrl,
      sessionId: config.sessionId,
      userId: config.userId,
      autoReconnect: config.autoReconnect,
      maxReconnectAttempts: config.maxReconnectAttempts,
      reconnectDelay: config.reconnectDelay,
      connectionTimeout: config.connectionTimeout,
      heartbeatInterval: 30000,
      enableDebugLogging: config.enableDebugLogging
    });
    
    this.setupSignalingEventHandlers();
    this.log('debug', 'WebRTC Client initialisiert', { config });
  }

  // =============================================================================
  // AudioTransport Interface Implementation
  // =============================================================================

  async connect(): Promise<void> {
    if (this.state.isConnected) {
      this.log('warn', 'WebRTC Client bereits verbunden');
      return;
    }

    try {
      this.connectionStartTime = performance.now();
      this.updateConnectionState('connecting');
      
      this.log('info', 'Starte WebRTC Verbindung');
      
      // 1. Signaling Server verbinden
      await this.signalingClient.connect();
      
      // 2. PeerConnection erstellen
      await this.createPeerConnection();
      
      // 3. Lokalen Audio Stream erstellen
      await this.createLocalStream();
      
      // 4. Offer erstellen und senden
      await this.createAndSendOffer();
      
      // 5. Performance Monitoring starten
      if (this.config.enablePerformanceMonitoring) {
        this.startPerformanceMonitoring();
      }
      
    } catch (error) {
      this.handleConnectionError(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.log('info', 'Trenne WebRTC Verbindung');
    
    this.stopPerformanceMonitoring();
    this.updateConnectionState('disconnected');
    
    // Cleanup lokaler Stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    // Cleanup PeerConnection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    // Cleanup DataChannel
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    
    // Signaling Client trennen
    await this.signalingClient.disconnect();
    
    this.state.lastDisconnected = new Date();
    this.state.isConnected = false;
    this.state.audioTracks = [];
    this.state.remoteAudioTracks = [];
  }

  async sendAudio(audioData: ArrayBuffer): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new WebRTCAudioError('DataChannel nicht verfügbar für Audio-Übertragung');
    }

    try {
      // Audio-Daten über DataChannel senden (für zusätzliche Kontrolle)
      // Hauptsächlich wird Audio über MediaStream übertragen
      this.dataChannel.send(audioData);
      this.log('debug', 'Audio-Daten über DataChannel gesendet', { size: audioData.byteLength });
    } catch (error) {
      this.log('error', 'Fehler beim Senden von Audio-Daten', { error });
      throw new WebRTCAudioError('Fehler beim Senden von Audio-Daten', { error });
    }
  }

  async sendMessage(message: any): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new WebRTCConnectionError('DataChannel nicht verfügbar für Nachrichten');
    }

    try {
      const messageString = JSON.stringify(message);
      this.dataChannel.send(messageString);
      this.log('debug', 'Message über DataChannel gesendet', { message });
    } catch (error) {
      this.log('error', 'Fehler beim Senden der Message', { error });
      throw new WebRTCConnectionError('Fehler beim Senden der Message', { error });
    }
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
    return { ...this.state };
  }

  getMetrics(): WebRTCPerformanceMetrics {
    return { ...this.metrics };
  }

  // =============================================================================
  // WebRTC-spezifische Public Methods
  // =============================================================================

  /**
   * Lokalen Audio Stream erstellen
   */
  async createLocalStream(): Promise<MediaStream> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          ...this.config.audioConfig,
          deviceId: this.config.audioConfig.deviceId ? 
            { exact: this.config.audioConfig.deviceId } : undefined
        },
        video: false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Audio Tracks zum State hinzufügen
      const audioTracks = this.localStream.getAudioTracks();
      this.state.audioTracks = audioTracks;
      
      this.log('info', 'Lokaler Audio Stream erstellt', { 
        trackCount: audioTracks.length,
        constraints 
      });
      
      return this.localStream;
      
    } catch (error) {
      this.log('error', 'Fehler beim Erstellen des lokalen Audio Streams', { error });
      throw new WebRTCAudioError('Fehler beim Erstellen des lokalen Audio Streams', { error });
    }
  }

  /**
   * Audio-Qualität in Echtzeit abrufen
   */
  async getAudioQuality(): Promise<AudioQualityMetrics> {
    if (!this.peerConnection) {
      throw new WebRTCError('PeerConnection nicht verfügbar', 'NO_PEER_CONNECTION');
    }

    try {
      const stats = await this.peerConnection.getStats();
      const audioQuality = this.extractAudioQualityFromStats(stats);
      
      this.metrics.audioQuality = audioQuality;
      return audioQuality;
      
    } catch (error) {
      this.log('error', 'Fehler beim Abrufen der Audio-Qualität', { error });
      throw new WebRTCError('Fehler beim Abrufen der Audio-Qualität', 'STATS_ERROR', { error });
    }
  }

  /**
   * ICE Connection State
   */
  getIceConnectionState(): RTCIceConnectionState {
    return this.peerConnection?.iceConnectionState || 'new';
  }

  /**
   * Signaling State
   */
  getSignalingState(): RTCSignalingState {
    return this.peerConnection?.signalingState || 'stable';
  }

  /**
   * Ist Audio verfügbar
   */
  hasAudio(): boolean {
    return this.state.audioTracks.length > 0 || this.state.remoteAudioTracks.length > 0;
  }

  // =============================================================================
  // Private Methods - Connection Setup
  // =============================================================================

  private async createPeerConnection(): Promise<void> {
    try {
      this.peerConnection = new RTCPeerConnection(this.config.webrtcConfig.rtcConfiguration);

      this.setupPeerConnectionEventHandlers();

      // DataChannel für zusätzliche Kommunikation erstellen
      this.dataChannel = this.peerConnection.createDataChannel('voice-data', {
        ordered: true,
        maxRetransmits: 3
      });

      this.setupDataChannelEventHandlers();

      this.log('info', 'PeerConnection erstellt');

    } catch (error) {
      this.log('error', 'Fehler beim Erstellen der PeerConnection', { error });
      throw new WebRTCConnectionError('Fehler beim Erstellen der PeerConnection', { error });
    }
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.peerConnection || !this.localStream) {
      throw new WebRTCConnectionError('PeerConnection oder lokaler Stream nicht verfügbar');
    }

    try {
      // Lokalen Stream zur PeerConnection hinzufügen
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // ICE Gathering starten
      this.iceGatheringStartTime = performance.now();

      // Offer erstellen
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      // SDP für Codec-Präferenzen manipulieren
      const manipulatedSDP = manipulateSDPForCodecs(offer.sdp!, this.config.webrtcConfig.audioCodecs);
      offer.sdp = manipulatedSDP;

      // Lokale Description setzen
      await this.peerConnection.setLocalDescription(offer);

      // Offer über Signaling senden
      await this.signalingClient.sendOffer(offer, this.config.audioConfig);

      this.log('info', 'SDP Offer erstellt und gesendet');

    } catch (error) {
      this.log('error', 'Fehler beim Erstellen/Senden des Offers', { error });
      throw new WebRTCConnectionError('Fehler beim Erstellen/Senden des Offers', { error });
    }
  }

  private setupPeerConnectionEventHandlers(): void {
    if (!this.peerConnection) return;

    // ICE Candidate Event
    this.peerConnection.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        this.signalingClient.sendIceCandidate(event.candidate.toJSON());
        this.log('debug', 'ICE Candidate gesendet', { candidate: event.candidate });
      } else {
        this.log('debug', 'ICE Gathering abgeschlossen');
        this.metrics.iceGatheringTime = performance.now() - this.iceGatheringStartTime;
      }
    });

    // ICE Connection State Change
    this.peerConnection.addEventListener('iceconnectionstatechange', () => {
      const state = this.peerConnection!.iceConnectionState;
      this.state.iceConnectionState = state;

      this.log('info', 'ICE Connection State geändert', { state });
      this.emit('ice-connection-state-change', { state });

      if (state === 'connected' || state === 'completed') {
        this.handleConnectionEstablished();
      } else if (state === 'failed' || state === 'disconnected') {
        this.handleConnectionFailed();
      }
    });

    // Signaling State Change
    this.peerConnection.addEventListener('signalingstatechange', () => {
      const state = this.peerConnection!.signalingState;
      this.state.signalingState = state;

      this.log('info', 'Signaling State geändert', { state });
      this.emit('signaling-state-change', { state });
    });

    // Remote Stream Event
    this.peerConnection.addEventListener('track', (event) => {
      this.log('info', 'Remote Track empfangen', { track: event.track });

      if (event.track.kind === 'audio') {
        this.state.remoteAudioTracks.push(event.track);
        this.emit('audio-track-added', { track: event.track, stream: event.streams[0] });

        // Remote Stream für Playback speichern
        if (event.streams[0]) {
          this.remoteStream = event.streams[0];
        }
      }
    });

    // DataChannel Event (für eingehende DataChannels)
    this.peerConnection.addEventListener('datachannel', (event) => {
      const channel = event.channel;
      this.log('info', 'Remote DataChannel empfangen', { label: channel.label });
      this.setupDataChannelEventHandlers(channel);
    });
  }

  private setupDataChannelEventHandlers(channel?: RTCDataChannel): void {
    const dataChannel = channel || this.dataChannel;
    if (!dataChannel) return;

    dataChannel.addEventListener('open', () => {
      this.log('info', 'DataChannel geöffnet', { label: dataChannel.label });
      this.emit('data-channel-open', { channel: dataChannel });
    });

    dataChannel.addEventListener('close', () => {
      this.log('info', 'DataChannel geschlossen', { label: dataChannel.label });
      this.emit('data-channel-close', { channel: dataChannel });
    });

    dataChannel.addEventListener('message', (event) => {
      this.handleDataChannelMessage(event.data);
    });

    dataChannel.addEventListener('error', (event) => {
      this.log('error', 'DataChannel Fehler', { error: event });
    });
  }

  private setupSignalingEventHandlers(): void {
    // Answer empfangen
    this.signalingClient.on('answer-received', async (message) => {
      try {
        await this.handleRemoteAnswer(message.answer);
      } catch (error) {
        this.log('error', 'Fehler beim Verarbeiten der Answer', { error });
      }
    });

    // ICE Candidate empfangen
    this.signalingClient.on('ice-candidate-received', async (message) => {
      try {
        await this.handleRemoteIceCandidate(message.candidate);
      } catch (error) {
        this.log('error', 'Fehler beim Verarbeiten des ICE Candidates', { error });
      }
    });

    // Offer empfangen (für Answerer-Rolle)
    this.signalingClient.on('offer-received', async (message) => {
      try {
        await this.handleRemoteOffer(message.offer);
      } catch (error) {
        this.log('error', 'Fehler beim Verarbeiten des Offers', { error });
      }
    });

    // Error empfangen
    this.signalingClient.on('error-received', (message) => {
      const error = new WebRTCError(message.errorMessage, message.errorCode, message.errorDetails);
      this.handleConnectionError(error);
    });
  }

  // =============================================================================
  // Private Methods - Message Handling
  // =============================================================================

  private async handleRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new WebRTCConnectionError('PeerConnection nicht verfügbar für Answer');
    }

    try {
      await this.peerConnection.setRemoteDescription(answer);
      this.log('info', 'Remote Answer verarbeitet');
    } catch (error) {
      this.log('error', 'Fehler beim Setzen der Remote Description (Answer)', { error });
      throw new WebRTCConnectionError('Fehler beim Setzen der Remote Description', { error });
    }
  }

  private async handleRemoteOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new WebRTCConnectionError('PeerConnection nicht verfügbar für Offer');
    }

    try {
      // Remote Description setzen
      await this.peerConnection.setRemoteDescription(offer);

      // Answer erstellen
      const answer = await this.peerConnection.createAnswer();

      // SDP für Codec-Präferenzen manipulieren
      const manipulatedSDP = manipulateSDPForCodecs(answer.sdp!, this.config.webrtcConfig.audioCodecs);
      answer.sdp = manipulatedSDP;

      // Lokale Description setzen
      await this.peerConnection.setLocalDescription(answer);

      // Answer senden
      await this.signalingClient.sendAnswer(answer);

      this.log('info', 'Remote Offer verarbeitet und Answer gesendet');

    } catch (error) {
      this.log('error', 'Fehler beim Verarbeiten des Remote Offers', { error });
      throw new WebRTCConnectionError('Fehler beim Verarbeiten des Remote Offers', { error });
    }
  }

  private async handleRemoteIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      throw new WebRTCConnectionError('PeerConnection nicht verfügbar für ICE Candidate');
    }

    try {
      await this.peerConnection.addIceCandidate(candidate);
      this.log('debug', 'Remote ICE Candidate hinzugefügt', { candidate });
    } catch (error) {
      this.log('error', 'Fehler beim Hinzufügen des ICE Candidates', { error, candidate });
      // ICE Candidate Fehler sind nicht kritisch, Connection kann trotzdem funktionieren
    }
  }

  private handleDataChannelMessage(data: string | ArrayBuffer): void {
    try {
      if (typeof data === 'string') {
        // JSON Message
        const message = JSON.parse(data);
        this.log('debug', 'DataChannel Message empfangen', { message });
        // Emit als generisches Event
        this.emit('message-received', { message });
      } else {
        // Binary Audio Data
        this.log('debug', 'DataChannel Audio-Daten empfangen', { size: data.byteLength });
        this.emit('audio-data-received', { audioData: data });
      }
    } catch (error) {
      this.log('error', 'Fehler beim Verarbeiten der DataChannel Message', { error });
    }
  }

  // =============================================================================
  // Private Methods - Connection State Management
  // =============================================================================

  private handleConnectionEstablished(): void {
    this.updateConnectionState('connected');
    this.state.isConnected = true;
    this.state.lastConnected = new Date();
    this.state.reconnectAttempts = 0;
    this.state.error = null;

    this.metrics.connectionSetupTime = performance.now() - this.connectionStartTime;

    this.log('info', 'WebRTC Verbindung hergestellt', {
      setupTime: this.metrics.connectionSetupTime
    });

    this.emit('connection-state-change', {
      state: 'connected',
      previousState: 'connecting'
    });
  }

  private handleConnectionFailed(): void {
    this.updateConnectionState('failed');
    this.state.isConnected = false;
    this.state.error = new WebRTCConnectionError('WebRTC Verbindung fehlgeschlagen');

    this.log('error', 'WebRTC Verbindung fehlgeschlagen');

    this.emit('connection-state-change', {
      state: 'failed',
      previousState: 'connected'
    });

    // Auto-Reconnect falls aktiviert
    if (this.config.autoReconnect && this.state.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private handleConnectionError(error: Error): void {
    this.state.error = error;
    this.updateConnectionState('failed');

    this.log('error', 'WebRTC Connection Error', { error });
    this.emit('error', { error, context: 'webrtc-connection' });
  }

  private scheduleReconnect(): void {
    this.state.reconnectAttempts++;
    this.updateConnectionState('reconnecting');

    const delay = this.config.reconnectDelay * Math.pow(2, this.state.reconnectAttempts - 1);
    this.log('info', `WebRTC Reconnect in ${delay}ms (Versuch ${this.state.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(error => {
        this.log('error', 'WebRTC Reconnect fehlgeschlagen', { error });
      });
    }, delay);
  }

  private updateConnectionState(state: WebRTCConnectionState): void {
    const previousState = this.state.connectionState;
    this.state.connectionState = state;

    if (state !== previousState) {
      this.log('debug', 'WebRTC Connection State geändert', { state, previousState });
    }
  }

  // =============================================================================
  // Private Methods - Performance Monitoring
  // =============================================================================

  private startPerformanceMonitoring(): void {
    // Metrics alle 5 Sekunden aktualisieren
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 5000);

    // Audio-Qualität alle 2 Sekunden prüfen
    this.qualityCheckInterval = setInterval(() => {
      this.updateAudioQuality();
    }, 2000);

    this.log('debug', 'Performance Monitoring gestartet');
  }

  private stopPerformanceMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
      this.qualityCheckInterval = null;
    }

    this.log('debug', 'Performance Monitoring gestoppt');
  }

  private async updateMetrics(): Promise<void> {
    if (!this.peerConnection) return;

    try {
      const stats = await this.peerConnection.getStats();
      this.extractMetricsFromStats(stats);

      this.emit('metrics-update', { metrics: this.metrics });

    } catch (error) {
      this.log('error', 'Fehler beim Aktualisieren der Metrics', { error });
    }
  }

  private async updateAudioQuality(): Promise<void> {
    try {
      const audioQuality = await this.getAudioQuality();
      this.emit('quality-change', { quality: audioQuality });
    } catch (error) {
      // Fehler beim Audio-Quality-Check sind nicht kritisch
      this.log('debug', 'Fehler beim Audio-Quality-Check', { error });
    }
  }

  private extractMetricsFromStats(stats: RTCStatsReport): void {
    for (const [id, stat] of stats) {
      if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
        this.metrics.bytesSent = stat.bytesSent || 0;
        this.metrics.packetsSent = stat.packetsSent || 0;
      }

      if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
        this.metrics.bytesReceived = stat.bytesReceived || 0;
        this.metrics.packetsReceived = stat.packetsReceived || 0;
        this.metrics.packetsLost = stat.packetsLost || 0;
      }

      if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        this.metrics.currentLatency = stat.currentRoundTripTime ? stat.currentRoundTripTime * 1000 : 0;

        // Durchschnittliche Latenz berechnen (einfacher gleitender Durchschnitt)
        if (this.metrics.averageLatency === 0) {
          this.metrics.averageLatency = this.metrics.currentLatency;
        } else {
          this.metrics.averageLatency = (this.metrics.averageLatency * 0.9) + (this.metrics.currentLatency * 0.1);
        }
      }
    }
  }

  private extractAudioQualityFromStats(stats: RTCStatsReport): AudioQualityMetrics {
    let bitrate = 0;
    let packetLossRate = 0;
    let roundTripTime = 0;
    let jitter = 0;
    let audioLevel = 0;
    let codec = '';

    for (const [id, stat] of stats) {
      if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
        // Bitrate berechnen (Bytes pro Sekunde zu Bits pro Sekunde)
        if (stat.bytesSent && stat.timestamp) {
          const timeDiff = (stat.timestamp - (this.metrics.audioQuality.timestamp || stat.timestamp)) / 1000;
          const bytesDiff = stat.bytesSent - (this.metrics.bytesSent || 0);
          if (timeDiff > 0) {
            bitrate = (bytesDiff * 8) / timeDiff / 1000; // kbps
          }
        }
      }

      if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
        packetLossRate = stat.packetsLost && stat.packetsReceived ?
          stat.packetsLost / (stat.packetsLost + stat.packetsReceived) : 0;
        jitter = stat.jitter ? stat.jitter * 1000 : 0; // ms
        audioLevel = stat.audioLevel || 0;
      }

      if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        roundTripTime = stat.currentRoundTripTime ? stat.currentRoundTripTime * 1000 : 0; // ms
      }

      if (stat.type === 'codec' && stat.mimeType && stat.mimeType.includes('audio')) {
        codec = stat.mimeType.split('/')[1] || '';
      }
    }

    return {
      bitrate,
      packetLossRate,
      roundTripTime,
      jitter,
      audioLevel,
      codec,
      timestamp: Date.now()
    };
  }

  // =============================================================================
  // Private Methods - Utilities
  // =============================================================================

  private emit<K extends keyof WebRTCEventMap>(event: K, data: WebRTCEventMap[K]): void {
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
    if (!this.config.enableDebugLogging && level === 'debug') {
      return;
    }

    const logMessage = `[WebRTC Client] ${message}`;

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
