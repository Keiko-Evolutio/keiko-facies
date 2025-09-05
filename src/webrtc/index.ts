/**
 * WebRTC Integration - Haupt-Export-Datei
 * 
 * Zentrale Exports für WebRTC-Integration im Voice-Service-System.
 * Bietet einheitliche API für P2P-Audio-Kommunikation mit Fallback.
 * 
 * @version 1.0.0
 */

// =============================================================================
// Core Components
// =============================================================================

export { WebRTCClient } from './webrtc-client';
export { WebRTCSignalingClient } from './signaling-client';
export { TransportManager, createTransportManager } from './transport-manager';
export { WebRTCVoiceClient, createWebRTCVoiceClient } from './voice-client-webrtc';

// =============================================================================
// Configuration
// =============================================================================

export {
  createWebRTCConfig,
  createAudioConfig,
  createWebRTCClientConfig,
  DEFAULT_WEBRTC_CONFIG,
  PRODUCTION_WEBRTC_CONFIG,
  DEVELOPMENT_WEBRTC_CONFIG,
  LOW_LATENCY_AUDIO_CONFIG,
  BALANCED_AUDIO_CONFIG,
  HIGH_QUALITY_AUDIO_CONFIG,
  VOICE_AUDIO_CODECS,
  manipulateSDPForCodecs,
  validateWebRTCConfig,
  validateAudioConfig
} from './config';

// =============================================================================
// Types
// =============================================================================

export type {
  // Core Types
  WebRTCConfiguration,
  WebRTCClientConfig,
  WebRTCAudioConfig,
  AudioCodecPreference,
  
  // State Types
  WebRTCConnectionState,
  WebRTCClientState,
  WebRTCSignalingState,
  WebRTCIceConnectionState,
  WebRTCIceGatheringState,
  
  // Signaling Types
  SignalingMessageType,
  SignalingMessage,
  BaseSignalingMessage,
  OfferMessage,
  AnswerMessage,
  IceCandidateMessage,
  ErrorMessage,
  
  // Performance Types
  WebRTCPerformanceMetrics,
  AudioQualityMetrics,
  
  // Event Types
  WebRTCEventMap,
  
  // Transport Types
  AudioTransport,
  
  // Enhanced Voice Client Types
  EnhancedVoiceConfiguration,
  WebRTCVoiceClientEvents
} from './types';

export type { 
  TransportManagerConfig 
} from './transport-manager';

export type {
  EnhancedVoiceConfiguration,
  WebRTCVoiceClientEvents
} from './voice-client-webrtc';

// =============================================================================
// Error Types
// =============================================================================

export {
  WebRTCError,
  WebRTCConnectionError,
  WebRTCSignalingError,
  WebRTCAudioError
} from './types';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Prüft WebRTC-Browser-Unterstützung
 */
export function isWebRTCSupported(): boolean {
  return !!(
    window.RTCPeerConnection &&
    window.RTCSessionDescription &&
    window.RTCIceCandidate &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
}

/**
 * Prüft erweiterte WebRTC-Features
 */
export function getWebRTCCapabilities(): {
  basicSupport: boolean;
  audioWorklet: boolean;
  insertableStreams: boolean;
  simulcast: boolean;
  svc: boolean;
} {
  const basicSupport = isWebRTCSupported();
  
  return {
    basicSupport,
    audioWorklet: !!(window.AudioWorklet && window.AudioWorkletNode),
    insertableStreams: !!(window.RTCRtpSender && 'createEncodedStreams' in RTCRtpSender.prototype),
    simulcast: !!(window.RTCRtpTransceiver && 'setCodecPreferences' in RTCRtpTransceiver.prototype),
    svc: false // SVC support detection is complex and browser-specific
  };
}

/**
 * Erstellt optimierte WebRTC-Konfiguration basierend auf Browser-Capabilities
 */
export function createOptimizedWebRTCConfig(
  sessionId: string,
  userId: string,
  signalingUrl: string,
  options: {
    preferredTransport?: 'webrtc' | 'websocket';
    audioQuality?: 'low-latency' | 'balanced' | 'high-quality';
    enableFallback?: boolean;
    customConfig?: Partial<WebRTCClientConfig>;
  } = {}
): WebRTCClientConfig {
  const capabilities = getWebRTCCapabilities();
  
  // Fallback zu WebSocket wenn WebRTC nicht unterstützt
  if (!capabilities.basicSupport) {
    console.warn('WebRTC nicht unterstützt, verwende WebSocket-Fallback');
    options.preferredTransport = 'websocket';
    options.enableFallback = false;
  }
  
  // Audio-Qualität basierend auf Capabilities anpassen
  let audioQuality = options.audioQuality || 'low-latency';
  if (!capabilities.audioWorklet && audioQuality === 'low-latency') {
    console.warn('AudioWorklet nicht unterstützt, verwende balanced Audio-Qualität');
    audioQuality = 'balanced';
  }
  
  return createWebRTCClientConfig(sessionId, userId, signalingUrl, {
    ...options,
    audioQuality,
    customConfig: {
      enablePerformanceMonitoring: capabilities.basicSupport,
      enableDebugLogging: import.meta.env.DEV,
      ...options.customConfig
    }
  });
}

/**
 * Diagnostiziert WebRTC-Verbindungsprobleme
 */
export async function diagnoseWebRTCConnection(): Promise<{
  browserSupport: boolean;
  networkConnectivity: boolean;
  stunServerReachable: boolean;
  microphoneAccess: boolean;
  recommendations: string[];
}> {
  const results = {
    browserSupport: false,
    networkConnectivity: false,
    stunServerReachable: false,
    microphoneAccess: false,
    recommendations: [] as string[]
  };
  
  // Browser Support Check
  results.browserSupport = isWebRTCSupported();
  if (!results.browserSupport) {
    results.recommendations.push('Browser unterstützt WebRTC nicht - verwenden Sie Chrome, Firefox oder Safari');
  }
  
  // Network Connectivity Check
  try {
    const response = await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' });
    results.networkConnectivity = true;
  } catch {
    results.networkConnectivity = false;
    results.recommendations.push('Keine Internetverbindung erkannt');
  }
  
  // STUN Server Check
  if (results.browserSupport) {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('STUN timeout')), 5000)
      );
      
      const iceGathering = new Promise((resolve) => {
        pc.onicecandidate = (event) => {
          if (event.candidate && event.candidate.candidate.includes('srflx')) {
            resolve(true);
          }
        };
        pc.createDataChannel('test');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
      });
      
      await Promise.race([iceGathering, timeout]);
      results.stunServerReachable = true;
      pc.close();
    } catch {
      results.stunServerReachable = false;
      results.recommendations.push('STUN Server nicht erreichbar - prüfen Sie Firewall-Einstellungen');
    }
  }
  
  // Microphone Access Check
  if (results.browserSupport) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      results.microphoneAccess = true;
      stream.getTracks().forEach(track => track.stop());
    } catch {
      results.microphoneAccess = false;
      results.recommendations.push('Mikrofon-Zugriff verweigert - prüfen Sie Browser-Berechtigungen');
    }
  }
  
  // Allgemeine Empfehlungen
  if (results.browserSupport && results.networkConnectivity && results.stunServerReachable && results.microphoneAccess) {
    results.recommendations.push('WebRTC sollte funktionieren');
  } else {
    results.recommendations.push('WebSocket-Fallback wird empfohlen');
  }
  
  return results;
}

/**
 * Erstellt WebRTC Voice Client mit automatischer Konfiguration
 */
export async function createAutoConfiguredWebRTCVoiceClient(
  baseUrl: string,
  handleServerMessage: (update: any) => Promise<void>,
  setAnalyzer: (analyzer: AnalyserNode) => void,
  userId: string,
  sessionId?: string
): Promise<WebRTCVoiceClient> {
  
  // Diagnose durchführen
  const diagnosis = await diagnoseWebRTCConnection();
  
  // Session ID generieren falls nicht vorhanden
  const finalSessionId = sessionId || `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // WebRTC Signaling URL aus Base URL ableiten
  const signalingUrl = baseUrl.replace(/^http/, 'ws') + '/webrtc-signaling';
  
  // Optimierte Konfiguration erstellen
  const config = createOptimizedWebRTCConfig(
    finalSessionId,
    userId,
    signalingUrl,
    {
      preferredTransport: diagnosis.browserSupport ? 'webrtc' : 'websocket',
      enableFallback: true,
      audioQuality: diagnosis.microphoneAccess ? 'low-latency' : 'balanced'
    }
  );
  
  // Enhanced Voice Configuration
  const enhancedConfig = {
    transport: config.webrtcConfig ? 'webrtc' : 'websocket',
    webrtc: {
      enableFallback: config.enableWebSocketFallback,
      fallbackTimeout: config.connectionTimeout,
      audioQuality: 'low-latency' as const,
      enableDebugLogging: config.enableDebugLogging
    }
  };
  
  return createWebRTCVoiceClient(baseUrl, handleServerMessage, setAnalyzer, enhancedConfig);
}

// =============================================================================
// Version Information
// =============================================================================

export const WEBRTC_VERSION = '1.0.0';
export const WEBRTC_BUILD_DATE = new Date().toISOString();

/**
 * Gibt WebRTC-Integration-Informationen zurück
 */
export function getWebRTCInfo(): {
  version: string;
  buildDate: string;
  browserSupport: boolean;
  capabilities: ReturnType<typeof getWebRTCCapabilities>;
} {
  return {
    version: WEBRTC_VERSION,
    buildDate: WEBRTC_BUILD_DATE,
    browserSupport: isWebRTCSupported(),
    capabilities: getWebRTCCapabilities()
  };
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  // Core Components
  WebRTCClient,
  WebRTCSignalingClient,
  TransportManager,
  WebRTCVoiceClient,
  
  // Factory Functions
  createTransportManager,
  createWebRTCVoiceClient,
  createWebRTCClientConfig,
  createAutoConfiguredWebRTCVoiceClient,
  
  // Utility Functions
  isWebRTCSupported,
  getWebRTCCapabilities,
  diagnoseWebRTCConnection,
  
  // Configuration
  DEFAULT_WEBRTC_CONFIG,
  LOW_LATENCY_AUDIO_CONFIG,
  
  // Version Info
  version: WEBRTC_VERSION,
  getWebRTCInfo
};
