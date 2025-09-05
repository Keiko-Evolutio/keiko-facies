/**
 * KEI-Stream TypeScript Typen für Frontend-Integration
 * 
 * Diese Datei definiert alle TypeScript-Typen für die KEI-Stream-Integration
 * im Keiko Personal Assistant Frontend.
 * 
 * @version 1.0.0
 */

// =============================================================================
// CORE TYPES
// =============================================================================

export type HeadersDict = Record<string, string>;

/**
 * KEI-Stream Frame-Typen gemäß Backend-Spezifikation
 */
export enum FrameType {
  PARTIAL = 'partial',
  FINAL = 'final',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  STATUS = 'status',
  ERROR = 'error',
  HEARTBEAT = 'heartbeat',
  ACK = 'ack',
  NACK = 'nack',
  RESUME = 'resume',
  CHUNK_START = 'chunk_start',
  CHUNK_CONTINUE = 'chunk_continue',
  CHUNK_END = 'chunk_end',
}

/**
 * ACK-Informationen für Flow-Control
 */
export interface AckInfo {
  ack_seq?: number;
  credit?: number;
  reason?: string;
}

/**
 * Chunk-Informationen für große Datenübertragungen
 */
export interface ChunkInfo {
  kind: 'start' | 'continue' | 'end';
  content_range?: string;
  checksum?: string;
}

/**
 * Fehler-Informationen in KEI-Stream Frames
 */
export interface ErrorInfo {
  code: string;
  message: string;
  retryable?: boolean;
  details?: Record<string, any>;
}

/**
 * KEI-Stream Frame-Struktur
 */
export interface KEIStreamFrame {
  id?: string;
  type: FrameType | `${FrameType}`;
  stream_id: string;
  seq?: number;
  ts?: string;
  corr_id?: string;
  headers?: HeadersDict;
  payload?: Record<string, any> | null;
  binary_ref?: string | null;
  chunk?: ChunkInfo | null;
  error?: ErrorInfo;
  ack?: AckInfo;
}

// =============================================================================
// CLIENT CONFIGURATION
// =============================================================================

/**
 * Konfiguration für KEI-Stream Client
 */
export interface KEIStreamClientConfig {
  /** WebSocket-URL (z.B. ws://localhost:8000/stream/ws/{session_id}) */
  url: string;
  /** Session-ID für die Verbindung */
  sessionId: string;
  /** API-Token für Authentifizierung */
  apiToken?: string;
  /** Tenant-ID für Multi-Tenancy */
  tenantId?: string;
  /** Berechtigungen/Scopes */
  scopes?: string[];
  /** Gewünschtes Kreditfenster für Flow-Control */
  ackCreditTarget?: number;
  /** Nach wie vielen Frames ACK gesendet wird */
  ackEvery?: number;
  /** Initiale Reconnect-Verzögerung in ms */
  reconnectInitialMs?: number;
  /** Maximale Reconnect-Verzögerung in ms */
  reconnectMaxMs?: number;
  /** OpenTelemetry-Tracing aktivieren */
  enableOTEL?: boolean;
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Listener-Funktion für KEI-Stream Frames
 */
export type KEIStreamListener = (frame: KEIStreamFrame) => void;

/**
 * Event-Handler-Map für verschiedene Frame-Typen
 */
export interface KEIStreamEventHandlers {
  [FrameType.PARTIAL]?: KEIStreamListener;
  [FrameType.FINAL]?: KEIStreamListener;
  [FrameType.TOOL_CALL]?: KEIStreamListener;
  [FrameType.TOOL_RESULT]?: KEIStreamListener;
  [FrameType.STATUS]?: KEIStreamListener;
  [FrameType.ERROR]?: KEIStreamListener;
  [FrameType.HEARTBEAT]?: KEIStreamListener;
  [FrameType.ACK]?: KEIStreamListener;
  [FrameType.NACK]?: KEIStreamListener;
  [FrameType.RESUME]?: KEIStreamListener;
  [FrameType.CHUNK_START]?: KEIStreamListener;
  [FrameType.CHUNK_CONTINUE]?: KEIStreamListener;
  [FrameType.CHUNK_END]?: KEIStreamListener;
}

// =============================================================================
// CLIENT STATE
// =============================================================================

/**
 * Verbindungsstatus des KEI-Stream Clients
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * Stream-Status für einzelne Streams
 */
export interface StreamStatus {
  streamId: string;
  lastSeq: number;
  creditWindow: number;
  pendingFrames: number;
  lastActivity: Date;
  isActive: boolean;
}

/**
 * Client-Status-Informationen
 */
export interface KEIStreamClientStatus {
  connectionState: ConnectionState;
  connectedAt?: Date;
  lastError?: Error;
  reconnectAttempts: number;
  streams: Map<string, StreamStatus>;
  totalFramesSent: number;
  totalFramesReceived: number;
}

// =============================================================================
// REACT INTEGRATION
// =============================================================================

/**
 * Hook-Konfiguration für useKEIStream
 */
export interface UseKEIStreamConfig extends Partial<KEIStreamClientConfig> {
  /** Automatisch verbinden beim Mount */
  autoConnect?: boolean;
  /** Automatisch reconnecten bei Verbindungsabbruch */
  autoReconnect?: boolean;
  /** Debug-Modus aktivieren */
  debug?: boolean;
}

/**
 * Rückgabewerte des useKEIStream Hooks
 */
export interface UseKEIStreamReturn {
  /** Client-Instanz */
  client: KEIStreamClient | null;
  /** Aktueller Verbindungsstatus */
  connectionState: ConnectionState;
  /** Client-Status-Informationen */
  status: KEIStreamClientStatus;
  /** Verbindung herstellen */
  connect: () => Promise<void>;
  /** Verbindung trennen */
  disconnect: () => Promise<void>;
  /** Frame senden */
  sendFrame: (streamId: string, type: FrameType, payload?: Record<string, any>) => void;
  /** Listener registrieren */
  onFrame: (streamId: string, listener: KEIStreamListener) => () => void;
  /** Globalen Listener registrieren */
  onAnyFrame: (listener: KEIStreamListener) => () => void;
  /** Replay von Frames */
  replay: (streamId: string, sinceSeq: number) => KEIStreamFrame[];
  /** Letzter Fehler */
  lastError: Error | null;
}

// =============================================================================
// VISUALIZATION
// =============================================================================

/**
 * Daten für Stream-Visualisierung
 */
export interface StreamVisualizationData {
  streamId: string;
  frames: KEIStreamFrame[];
  frameRate: number;
  dataVolume: number;
  latency: number;
  errorRate: number;
  lastUpdate: Date;
}

/**
 * Konfiguration für Stream-Visualisierung
 */
export interface StreamVisualizationConfig {
  /** Maximale Anzahl anzuzeigender Frames */
  maxFrames?: number;
  /** Update-Intervall in ms */
  updateInterval?: number;
  /** Zeige nur bestimmte Frame-Typen */
  frameTypeFilter?: FrameType[];
  /** Zeige nur bestimmte Streams */
  streamFilter?: string[];
  /** Echtzeit-Updates aktivieren */
  realTimeUpdates?: boolean;
}

// =============================================================================
// FORWARD DECLARATION
// =============================================================================

/**
 * Forward declaration für KEIStreamClient
 * Die tatsächliche Implementierung befindet sich in client.ts
 */
export declare class KEIStreamClient {
  constructor(config: KEIStreamClientConfig);
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  on(streamId: string, listener: KEIStreamListener): () => void;
  onAny(listener: KEIStreamListener): () => void;
  send(streamId: string, type: FrameType, payload?: Record<string, any>): void;
  replay(streamId: string, sinceSeq: number): KEIStreamFrame[];
  getStatus(): KEIStreamClientStatus;
}
