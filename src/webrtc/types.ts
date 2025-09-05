/**
 * WebRTC Types und Interfaces für Voice-Service-System
 * 
 * Definiert alle TypeScript-Typen für WebRTC-Integration mit vollständiger Type Safety.
 * Unterstützt P2P-Audio-Kommunikation mit Fallback-Mechanismus zu WebSocket.
 * 
 * @version 1.0.0
 */

// =============================================================================
// WebRTC Connection Types
// =============================================================================

export interface WebRTCConfiguration {
  /** ICE Server Konfiguration für NAT Traversal */
  iceServers: RTCIceServer[];
  /** ICE Transport Policy */
  iceTransportPolicy?: RTCIceTransportPolicy;
  /** Bundle Policy für Media Streams */
  bundlePolicy?: RTCBundlePolicy;
  /** RTC Configuration für Peer Connection */
  rtcConfiguration?: RTCConfiguration;
  /** Audio Codec Präferenzen */
  audioCodecs: AudioCodecPreference[];
  /** DTLS Fingerprint für Security */
  dtlsFingerprint?: string;
}

export interface AudioCodecPreference {
  /** Codec Name (z.B. 'opus', 'G722') */
  codec: string;
  /** Priorität (höher = bevorzugt) */
  priority: number;
  /** Codec-spezifische Parameter */
  parameters?: Record<string, string | number>;
  /** Bitrate in kbps */
  bitrate?: number;
}

// =============================================================================
// WebRTC Client States
// =============================================================================

export type WebRTCConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'closed';

export type WebRTCSignalingState = RTCSignalingState;
export type WebRTCIceConnectionState = RTCIceConnectionState;
export type WebRTCIceGatheringState = RTCIceGatheringState;

export interface WebRTCClientState {
  /** Aktuelle Verbindungsstate */
  connectionState: WebRTCConnectionState;
  /** WebRTC Signaling State */
  signalingState: WebRTCSignalingState;
  /** ICE Connection State */
  iceConnectionState: WebRTCIceConnectionState;
  /** ICE Gathering State */
  iceGatheringState: WebRTCIceGatheringState;
  /** Ist Client verbunden */
  isConnected: boolean;
  /** Letzte Verbindungszeit */
  lastConnected: Date | null;
  /** Letzte Disconnection-Zeit */
  lastDisconnected: Date | null;
  /** Anzahl Reconnect-Versuche */
  reconnectAttempts: number;
  /** Maximale Reconnect-Versuche */
  maxReconnectAttempts: number;
  /** Letzter Fehler */
  error: Error | null;
  /** Aktuelle Audio-Tracks */
  audioTracks: MediaStreamTrack[];
  /** Remote Audio-Tracks */
  remoteAudioTracks: MediaStreamTrack[];
}

// =============================================================================
// Signaling Protocol
// =============================================================================

export type SignalingMessageType = 
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'ice-candidate-error'
  | 'connection-state-change'
  | 'audio-state-change'
  | 'error'
  | 'ping'
  | 'pong';

export interface BaseSignalingMessage {
  /** Message Type */
  type: SignalingMessageType;
  /** Session ID für Message-Routing */
  sessionId: string;
  /** User ID des Senders */
  userId: string;
  /** Timestamp der Message */
  timestamp: number;
  /** Optionale Correlation ID */
  correlationId?: string;
}

export interface OfferMessage extends BaseSignalingMessage {
  type: 'offer';
  /** SDP Offer */
  offer: RTCSessionDescriptionInit;
  /** Audio Constraints */
  audioConstraints?: MediaTrackConstraints;
}

export interface AnswerMessage extends BaseSignalingMessage {
  type: 'answer';
  /** SDP Answer */
  answer: RTCSessionDescriptionInit;
}

export interface IceCandidateMessage extends BaseSignalingMessage {
  type: 'ice-candidate';
  /** ICE Candidate */
  candidate: RTCIceCandidateInit;
}

export interface ErrorMessage extends BaseSignalingMessage {
  type: 'error';
  /** Error Code */
  errorCode: string;
  /** Error Message */
  errorMessage: string;
  /** Error Details */
  errorDetails?: Record<string, any>;
}

export type SignalingMessage = 
  | OfferMessage 
  | AnswerMessage 
  | IceCandidateMessage 
  | ErrorMessage
  | BaseSignalingMessage;

// =============================================================================
// Audio Processing Types
// =============================================================================

export interface WebRTCAudioConfig {
  /** Sample Rate (Standard: 48000 für WebRTC) */
  sampleRate: number;
  /** Channel Count (1 = Mono, 2 = Stereo) */
  channelCount: number;
  /** Echo Cancellation aktiviert */
  echoCancellation: boolean;
  /** Noise Suppression aktiviert */
  noiseSuppression: boolean;
  /** Auto Gain Control aktiviert */
  autoGainControl: boolean;
  /** Audio Device ID */
  deviceId?: string;
  /** Latenz-Modus */
  latency: 'interactive' | 'balanced' | 'playback';
}

export interface AudioQualityMetrics {
  /** Bitrate in kbps */
  bitrate: number;
  /** Packet Loss Rate (0-1) */
  packetLossRate: number;
  /** Round Trip Time in ms */
  roundTripTime: number;
  /** Jitter in ms */
  jitter: number;
  /** Audio Level (0-1) */
  audioLevel: number;
  /** Codec verwendet */
  codec: string;
  /** Timestamp der Messung */
  timestamp: number;
}

// =============================================================================
// Performance Monitoring
// =============================================================================

export interface WebRTCPerformanceMetrics {
  /** Connection Setup Time in ms */
  connectionSetupTime: number;
  /** ICE Gathering Time in ms */
  iceGatheringTime: number;
  /** DTLS Handshake Time in ms */
  dtlsHandshakeTime: number;
  /** Audio Quality Metrics */
  audioQuality: AudioQualityMetrics;
  /** Bytes gesendet */
  bytesSent: number;
  /** Bytes empfangen */
  bytesReceived: number;
  /** Packets gesendet */
  packetsSent: number;
  /** Packets empfangen */
  packetsReceived: number;
  /** Packets verloren */
  packetsLost: number;
  /** Aktuelle Latenz in ms */
  currentLatency: number;
  /** Durchschnittliche Latenz in ms */
  averageLatency: number;
}

// =============================================================================
// Event Types
// =============================================================================

export interface WebRTCEventMap {
  'connection-state-change': { state: WebRTCConnectionState; previousState: WebRTCConnectionState };
  'ice-connection-state-change': { state: RTCIceConnectionState };
  'signaling-state-change': { state: RTCSignalingState };
  'audio-track-added': { track: MediaStreamTrack; stream: MediaStream };
  'audio-track-removed': { track: MediaStreamTrack };
  'data-channel-open': { channel: RTCDataChannel };
  'data-channel-close': { channel: RTCDataChannel };
  'error': { error: Error; context?: string };
  'metrics-update': { metrics: WebRTCPerformanceMetrics };
  'quality-change': { quality: AudioQualityMetrics };
}

// =============================================================================
// Configuration Types
// =============================================================================

export interface WebRTCClientConfig {
  /** WebRTC Configuration */
  webrtcConfig: WebRTCConfiguration;
  /** Audio Configuration */
  audioConfig: WebRTCAudioConfig;
  /** Signaling Server URL */
  signalingUrl: string;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Auto-Reconnect aktiviert */
  autoReconnect: boolean;
  /** Maximale Reconnect-Versuche */
  maxReconnectAttempts: number;
  /** Reconnect Delay in ms */
  reconnectDelay: number;
  /** Connection Timeout in ms */
  connectionTimeout: number;
  /** ICE Gathering Timeout in ms */
  iceGatheringTimeout: number;
  /** Performance Monitoring aktiviert */
  enablePerformanceMonitoring: boolean;
  /** Debug Logging aktiviert */
  enableDebugLogging: boolean;
  /** Fallback zu WebSocket bei Fehlern */
  enableWebSocketFallback: boolean;
}

// =============================================================================
// Transport Abstraction
// =============================================================================

export interface AudioTransport {
  /** Transport Type */
  type: 'webrtc' | 'websocket';
  /** Verbindung starten */
  connect(): Promise<void>;
  /** Verbindung beenden */
  disconnect(): Promise<void>;
  /** Audio-Daten senden */
  sendAudio(audioData: ArrayBuffer): Promise<void>;
  /** Text-Message senden */
  sendMessage(message: any): Promise<void>;
  /** Event Listener registrieren */
  on<K extends keyof WebRTCEventMap>(event: K, listener: (data: WebRTCEventMap[K]) => void): void;
  /** Event Listener entfernen */
  off<K extends keyof WebRTCEventMap>(event: K, listener: (data: WebRTCEventMap[K]) => void): void;
  /** Aktueller State */
  getState(): WebRTCClientState;
  /** Performance Metrics */
  getMetrics(): WebRTCPerformanceMetrics;
}

// =============================================================================
// Error Types
// =============================================================================

export class WebRTCError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'WebRTCError';
  }
}

export class WebRTCConnectionError extends WebRTCError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONNECTION_ERROR', context);
    this.name = 'WebRTCConnectionError';
  }
}

export class WebRTCSignalingError extends WebRTCError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SIGNALING_ERROR', context);
    this.name = 'WebRTCSignalingError';
  }
}

export class WebRTCAudioError extends WebRTCError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'AUDIO_ERROR', context);
    this.name = 'WebRTCAudioError';
  }
}
