/**
 * WebRTC Konfiguration für Voice-Service-System
 * 
 * Zentrale Konfiguration für WebRTC-Integration mit optimierten Settings
 * für niedrige Latenz und hohe Audio-Qualität.
 * 
 * @version 1.0.0
 */

import type { 
  WebRTCConfiguration, 
  WebRTCClientConfig, 
  WebRTCAudioConfig,
  AudioCodecPreference 
} from './types';

// =============================================================================
// STUN/TURN Server Konfiguration
// =============================================================================

/** Standard STUN Server für NAT Traversal */
const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

/** TURN Server Konfiguration (für Production) */
const TURN_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'turn:turn.keiko-voice.com:3478',
      'turns:turn.keiko-voice.com:5349'
    ],
    username: import.meta.env.VITE_TURN_USERNAME || 'keiko-voice',
    credential: import.meta.env.VITE_TURN_PASSWORD || 'secure-turn-password'
  }
];

// =============================================================================
// Audio Codec Konfiguration
// =============================================================================

/** Optimierte Audio Codec Präferenzen für Voice */
export const VOICE_AUDIO_CODECS: AudioCodecPreference[] = [
  {
    codec: 'opus',
    priority: 100,
    bitrate: 64, // 64 kbps für optimale Qualität/Bandbreite Balance
    parameters: {
      'useinbandfec': 1, // Forward Error Correction
      'usedtx': 1,       // Discontinuous Transmission
      'maxaveragebitrate': 64000,
      'maxplaybackrate': 48000,
      'stereo': 0,       // Mono für Voice
      'sprop-stereo': 0
    }
  },
  {
    codec: 'G722',
    priority: 80,
    bitrate: 64,
    parameters: {
      'mode': '1' // Wideband mode
    }
  },
  {
    codec: 'PCMU', // G.711 μ-law
    priority: 60,
    bitrate: 64,
    parameters: {}
  },
  {
    codec: 'PCMA', // G.711 A-law
    priority: 50,
    bitrate: 64,
    parameters: {}
  }
];

// =============================================================================
// WebRTC Basis-Konfiguration
// =============================================================================

/** Standard WebRTC Konfiguration */
export const DEFAULT_WEBRTC_CONFIG: WebRTCConfiguration = {
  iceServers: [
    ...DEFAULT_STUN_SERVERS,
    ...(import.meta.env.PROD ? TURN_SERVERS : [])
  ],
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcConfiguration: {
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle'
  },
  audioCodecs: VOICE_AUDIO_CODECS
};

/** Production WebRTC Konfiguration mit TURN Servern */
export const PRODUCTION_WEBRTC_CONFIG: WebRTCConfiguration = {
  ...DEFAULT_WEBRTC_CONFIG,
  iceServers: [
    ...DEFAULT_STUN_SERVERS,
    ...TURN_SERVERS
  ],
  iceTransportPolicy: 'all' // Erlaube TURN Fallback
};

/** Development WebRTC Konfiguration (nur STUN) */
export const DEVELOPMENT_WEBRTC_CONFIG: WebRTCConfiguration = {
  ...DEFAULT_WEBRTC_CONFIG,
  iceServers: DEFAULT_STUN_SERVERS,
  iceTransportPolicy: 'all'
};

// =============================================================================
// Audio Konfiguration
// =============================================================================

/** Optimierte Audio-Konfiguration für niedrige Latenz */
export const LOW_LATENCY_AUDIO_CONFIG: WebRTCAudioConfig = {
  sampleRate: 48000, // WebRTC Standard
  channelCount: 1,   // Mono für Voice
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  latency: 'interactive' // Niedrigste Latenz
};

/** Ausgewogene Audio-Konfiguration */
export const BALANCED_AUDIO_CONFIG: WebRTCAudioConfig = {
  sampleRate: 48000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  latency: 'balanced'
};

/** Hohe Qualität Audio-Konfiguration */
export const HIGH_QUALITY_AUDIO_CONFIG: WebRTCAudioConfig = {
  sampleRate: 48000,
  channelCount: 2, // Stereo für bessere Qualität
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  latency: 'playback'
};

// =============================================================================
// Client Konfiguration
// =============================================================================

/** Standard WebRTC Client Konfiguration */
export const DEFAULT_WEBRTC_CLIENT_CONFIG: Omit<WebRTCClientConfig, 'sessionId' | 'userId' | 'signalingUrl'> = {
  webrtcConfig: DEFAULT_WEBRTC_CONFIG,
  audioConfig: LOW_LATENCY_AUDIO_CONFIG,
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  connectionTimeout: 10000,
  iceGatheringTimeout: 5000,
  enablePerformanceMonitoring: true,
  enableDebugLogging: import.meta.env.DEV,
  enableWebSocketFallback: true
};

/** Production Client Konfiguration */
export const PRODUCTION_WEBRTC_CLIENT_CONFIG: Omit<WebRTCClientConfig, 'sessionId' | 'userId' | 'signalingUrl'> = {
  ...DEFAULT_WEBRTC_CLIENT_CONFIG,
  webrtcConfig: PRODUCTION_WEBRTC_CONFIG,
  enableDebugLogging: false,
  maxReconnectAttempts: 10,
  connectionTimeout: 15000
};

/** Development Client Konfiguration */
export const DEVELOPMENT_WEBRTC_CLIENT_CONFIG: Omit<WebRTCClientConfig, 'sessionId' | 'userId' | 'signalingUrl'> = {
  ...DEFAULT_WEBRTC_CLIENT_CONFIG,
  webrtcConfig: DEVELOPMENT_WEBRTC_CONFIG,
  enableDebugLogging: true,
  maxReconnectAttempts: 3,
  connectionTimeout: 5000
};

// =============================================================================
// Umgebungsbasierte Konfiguration
// =============================================================================

/**
 * Erstellt WebRTC-Konfiguration basierend auf aktueller Umgebung
 */
export function createWebRTCConfig(): WebRTCConfiguration {
  const environment = import.meta.env.PROD ? 'production' : 'development';
  
  switch (environment) {
    case 'production':
      return PRODUCTION_WEBRTC_CONFIG;
    case 'development':
    case 'test':
      return DEVELOPMENT_WEBRTC_CONFIG;
    default:
      return DEFAULT_WEBRTC_CONFIG;
  }
}

/**
 * Erstellt Audio-Konfiguration basierend auf Qualitätsstufe
 */
export function createAudioConfig(quality: 'low-latency' | 'balanced' | 'high-quality' = 'low-latency'): WebRTCAudioConfig {
  switch (quality) {
    case 'low-latency':
      return LOW_LATENCY_AUDIO_CONFIG;
    case 'balanced':
      return BALANCED_AUDIO_CONFIG;
    case 'high-quality':
      return HIGH_QUALITY_AUDIO_CONFIG;
    default:
      return LOW_LATENCY_AUDIO_CONFIG;
  }
}

/**
 * Erstellt vollständige Client-Konfiguration
 */
export function createWebRTCClientConfig(
  sessionId: string,
  userId: string,
  signalingUrl: string,
  options: {
    environment?: 'development' | 'production';
    audioQuality?: 'low-latency' | 'balanced' | 'high-quality';
    customConfig?: Partial<WebRTCClientConfig>;
  } = {}
): WebRTCClientConfig {
  const { environment = import.meta.env.PROD ? 'production' : 'development', audioQuality = 'low-latency', customConfig = {} } = options;
  
  const baseConfig = environment === 'production' 
    ? PRODUCTION_WEBRTC_CLIENT_CONFIG 
    : DEVELOPMENT_WEBRTC_CLIENT_CONFIG;
  
  return {
    ...baseConfig,
    sessionId,
    userId,
    signalingUrl,
    webrtcConfig: createWebRTCConfig(),
    audioConfig: createAudioConfig(audioQuality),
    ...customConfig
  };
}

// =============================================================================
// Codec Utilities
// =============================================================================

/**
 * Erstellt SDP-Manipulation für Codec-Präferenzen
 */
export function manipulateSDPForCodecs(sdp: string, codecPreferences: AudioCodecPreference[]): string {
  const lines = sdp.split('\r\n');
  const audioMLineIndex = lines.findIndex(line => line.startsWith('m=audio'));
  
  if (audioMLineIndex === -1) {
    return sdp;
  }
  
  // Finde alle Audio-Codecs in der SDP
  const codecMap = new Map<string, number>();
  const rtpmapLines: string[] = [];
  
  for (let i = audioMLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('m=')) break; // Nächste Media-Section
    
    if (line.startsWith('a=rtpmap:')) {
      const match = line.match(/a=rtpmap:(\d+)\s+([^\/]+)/);
      if (match) {
        const payloadType = parseInt(match[1]);
        const codecName = match[2].toLowerCase();
        codecMap.set(codecName, payloadType);
        rtpmapLines.push(line);
      }
    }
  }
  
  // Sortiere Codecs nach Präferenz
  const sortedCodecs = codecPreferences
    .filter(pref => codecMap.has(pref.codec.toLowerCase()))
    .sort((a, b) => b.priority - a.priority)
    .map(pref => codecMap.get(pref.codec.toLowerCase())!);
  
  // Aktualisiere m=audio Linie mit sortierten Codecs
  const audioMLine = lines[audioMLineIndex];
  const parts = audioMLine.split(' ');
  const newPayloadTypes = [...sortedCodecs, ...Array.from(codecMap.values()).filter(pt => !sortedCodecs.includes(pt))];
  
  lines[audioMLineIndex] = `${parts[0]} ${parts[1]} ${parts[2]} ${newPayloadTypes.join(' ')}`;
  
  return lines.join('\r\n');
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validiert WebRTC-Konfiguration
 */
export function validateWebRTCConfig(config: WebRTCConfiguration): boolean {
  if (!config.iceServers || config.iceServers.length === 0) {
    console.warn('WebRTC: Keine ICE Server konfiguriert');
    return false;
  }
  
  if (!config.audioCodecs || config.audioCodecs.length === 0) {
    console.warn('WebRTC: Keine Audio-Codecs konfiguriert');
    return false;
  }
  
  return true;
}

/**
 * Validiert Audio-Konfiguration
 */
export function validateAudioConfig(config: WebRTCAudioConfig): boolean {
  if (config.sampleRate < 8000 || config.sampleRate > 48000) {
    console.warn('WebRTC: Ungültige Sample Rate');
    return false;
  }
  
  if (config.channelCount < 1 || config.channelCount > 2) {
    console.warn('WebRTC: Ungültige Channel Count');
    return false;
  }
  
  return true;
}
