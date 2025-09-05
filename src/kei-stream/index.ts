/**
 * KEI-Stream Frontend-Integration - Haupt-Export-Datei
 * 
 * Diese Datei exportiert alle öffentlichen APIs des KEI-Stream-Moduls
 * für die einfache Integration in React-Anwendungen.
 * 
 * @version 1.0.0
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Core Types
  HeadersDict,
  KEIStreamFrame,
  AckInfo,
  ChunkInfo,
  ErrorInfo,
  
  // Configuration
  KEIStreamClientConfig,
  UseKEIStreamConfig,
  UseKEIStreamReturn,
  
  // State Management
  ConnectionState,
  StreamStatus,
  KEIStreamClientStatus,
  KEIStreamListener,
  KEIStreamEventHandlers,
  
  // Visualization
  StreamVisualizationData,
  StreamVisualizationConfig,
} from './types';

export {
  // Enums
  FrameType,
} from './types';

// =============================================================================
// CLIENT EXPORTS
// =============================================================================

export { KEIStreamClient } from './client';
export { KEIStreamSSEClient, createSSEClient } from './sse-client';
export { CompressionManager, getCompressionManager, createCompressionManager } from './compression';
export { TokenBucket, StreamTokenBucketManager, AdaptiveTokenBucket } from './token-bucket';
export {
  initializeTracing,
  injectTraceHeaders,
  instrumentFrame,
  traceStreamOperation
} from './tracing';

// =============================================================================
// HOOKS EXPORTS
// =============================================================================

export {
  useKEIStream,
  useKEIStreamConnection,
  useKEIStreamFrameType,
  useKEIStreamStats,
  useKEIStreamAutoReconnect,
  useKEIStreamDebug,
  useKEIStreamSSE,
  useKEIStreamTokenBuckets,
  useKEIStreamCompression,
} from './hooks';

// =============================================================================
// COMPONENT EXPORTS
// =============================================================================

export { default as StreamStatus } from '../components/kei-stream/StreamStatus';
export { default as FrameVisualization } from '../components/kei-stream/FrameVisualization';
export { default as StreamDashboard } from '../components/kei-stream/StreamDashboard';

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Erstellt eine Standard-KEI-Stream-Konfiguration für Entwicklungsumgebung
 */
export function createDevelopmentConfig(
  sessionId: string = 'frontend-session',
  overrides: Partial<KEIStreamClientConfig> = {}
): KEIStreamClientConfig {
  return {
    url: `ws://localhost:8000/stream/ws/${sessionId}`,
    sessionId,
    scopes: ['kei.stream.read', 'kei.stream.write'],
    ackCreditTarget: 16,
    ackEvery: 5,
    reconnectInitialMs: 1000,
    reconnectMaxMs: 10000,
    enableOTEL: false,
    ...overrides,
  };
}

/**
 * Erstellt eine Standard-KEI-Stream-Konfiguration für Produktionsumgebung
 */
export function createProductionConfig(
  sessionId: string,
  apiToken: string,
  tenantId?: string,
  overrides: Partial<KEIStreamClientConfig> = {}
): KEIStreamClientConfig {
  const baseUrl = import.meta.env.VITE_KEI_STREAM_URL || 'wss://api.keiko.ai/stream/ws';
  
  return {
    url: `${baseUrl}/${sessionId}`,
    sessionId,
    apiToken,
    tenantId,
    scopes: ['kei.stream.read', 'kei.stream.write'],
    ackCreditTarget: 32,
    ackEvery: 10,
    reconnectInitialMs: 2000,
    reconnectMaxMs: 30000,
    enableOTEL: true,
    ...overrides,
  };
}

/**
 * Validiert eine KEI-Stream-Konfiguration
 */
export function validateConfig(config: Partial<KEIStreamClientConfig>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.url) {
    errors.push('URL ist erforderlich');
  } else if (!config.url.startsWith('ws://') && !config.url.startsWith('wss://')) {
    errors.push('URL muss mit ws:// oder wss:// beginnen');
  }

  if (!config.sessionId) {
    errors.push('Session ID ist erforderlich');
  } else if (!/^[a-zA-Z0-9_-]+$/.test(config.sessionId)) {
    errors.push('Session ID darf nur alphanumerische Zeichen, Bindestriche und Unterstriche enthalten');
  }

  if (config.scopes && config.scopes.length === 0) {
    errors.push('Mindestens ein Scope ist erforderlich');
  }

  if (config.ackCreditTarget && config.ackCreditTarget < 1) {
    errors.push('ACK Credit Target muss mindestens 1 sein');
  }

  if (config.ackEvery && config.ackEvery < 1) {
    errors.push('ACK Every muss mindestens 1 sein');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Erstellt eine Test-Frame für Debugging-Zwecke
 */
export function createTestFrame(
  streamId: string,
  type: FrameType = FrameType.PARTIAL,
  payload: Record<string, any> = {}
): KEIStreamFrame {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    stream_id: streamId,
    seq: Math.floor(Math.random() * 1000),
    ts: new Date().toISOString(),
    headers: {
      'x-test-frame': 'true',
      'x-created-by': 'kei-stream-frontend',
    },
    payload: {
      test: true,
      timestamp: new Date().toISOString(),
      ...payload,
    },
  };
}

/**
 * Formatiert Frame-Größe für Anzeige
 */
export function formatFrameSize(frame: KEIStreamFrame): string {
  const frameJson = JSON.stringify(frame);
  const sizeBytes = new Blob([frameJson]).size;
  
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  } else if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Berechnet Frame-Rate basierend auf Frame-Historie
 */
export function calculateFrameRate(frames: KEIStreamFrame[], windowMs: number = 60000): number {
  if (frames.length < 2) return 0;
  
  const now = Date.now();
  const windowStart = now - windowMs;
  
  const recentFrames = frames.filter(frame => {
    if (!frame.ts) return false;
    const frameTime = new Date(frame.ts).getTime();
    return frameTime >= windowStart;
  });
  
  if (recentFrames.length < 2) return 0;
  
  return (recentFrames.length / (windowMs / 1000));
}

/**
 * Gruppiert Frames nach Typ für Statistiken
 */
export function groupFramesByType(frames: KEIStreamFrame[]): Record<string, number> {
  const groups: Record<string, number> = {};
  
  for (const frame of frames) {
    const type = frame.type;
    groups[type] = (groups[type] || 0) + 1;
  }
  
  return groups;
}

/**
 * Extrahiert Fehler-Statistiken aus Frame-Historie
 */
export function extractErrorStats(frames: KEIStreamFrame[]): {
  totalErrors: number;
  errorsByCode: Record<string, number>;
  errorRate: number;
} {
  const errorFrames = frames.filter(frame => frame.type === FrameType.ERROR || frame.error);
  const errorsByCode: Record<string, number> = {};
  
  for (const frame of errorFrames) {
    if (frame.error?.code) {
      errorsByCode[frame.error.code] = (errorsByCode[frame.error.code] || 0) + 1;
    }
  }
  
  return {
    totalErrors: errorFrames.length,
    errorsByCode,
    errorRate: frames.length > 0 ? errorFrames.length / frames.length : 0,
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Standard-Scopes für verschiedene Anwendungsfälle
 */
export const STANDARD_SCOPES = {
  READ_ONLY: ['kei.stream.read'],
  WRITE_ONLY: ['kei.stream.write'],
  READ_WRITE: ['kei.stream.read', 'kei.stream.write'],
  ADMIN: ['kei.stream.read', 'kei.stream.write', 'kei.stream.admin'],
} as const;

/**
 * Standard-Konfigurationswerte
 */
export const DEFAULT_CONFIG = {
  ACK_CREDIT_TARGET: 16,
  ACK_EVERY: 5,
  RECONNECT_INITIAL_MS: 1000,
  RECONNECT_MAX_MS: 10000,
  MAX_FRAME_HISTORY: 1000,
  FRAME_RATE_WINDOW_MS: 60000,
} as const;

/**
 * Frame-Typ-Prioritäten für UI-Sortierung
 */
export const FRAME_TYPE_PRIORITY = {
  [FrameType.ERROR]: 1,
  [FrameType.FINAL]: 2,
  [FrameType.PARTIAL]: 3,
  [FrameType.TOOL_RESULT]: 4,
  [FrameType.TOOL_CALL]: 5,
  [FrameType.STATUS]: 6,
  [FrameType.ACK]: 7,
  [FrameType.NACK]: 8,
  [FrameType.HEARTBEAT]: 9,
  [FrameType.RESUME]: 10,
  [FrameType.CHUNK_START]: 11,
  [FrameType.CHUNK_CONTINUE]: 12,
  [FrameType.CHUNK_END]: 13,
} as const;
