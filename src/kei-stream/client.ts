/**
 * KEI-Stream Client für Frontend-Integration
 * 
 * Browser-optimierte Implementierung des KEI-Stream Clients mit:
 * - Auto-Reconnect mit Resume pro stream_id
 * - Kredit-/Flow-Control (ACK mit Credits)
 * - Token-Bucket für Fairness
 * - React-freundliche Event-Emitter-Architektur
 * 
 * @version 1.0.0
 */

import {
  KEIStreamClientConfig,
  KEIStreamFrame,
  FrameType,
  HeadersDict,
  KEIStreamListener,
  ConnectionState,
  KEIStreamClientStatus,
  StreamStatus,
} from './types';
import {
  injectTraceHeaders,
  instrumentFrame,
  traceStreamOperation,
  createStreamSpan,
  endSpan,
  recordSpanError
} from './tracing';
import {
  CompressionManager,
  CompressionProfile,
  getCompressionManager
} from './compression';
import {
  TokenBucket,
  StreamTokenBucketManager,
  DEFAULT_TOKEN_BUCKET_CONFIG
} from './token-bucket';

/**
 * Token-Bucket-Implementierung für Rate-Limiting pro Stream
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private rate: number,
    private capacity: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Prüft ob genügend Tokens verfügbar sind und verbraucht sie
   */
  allow(cost = 1): boolean {
    const now = Date.now();
    const elapsed = Math.max(0, now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
    this.lastRefill = now;

    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }
}

/**
 * KEI-Stream Client für Browser-Umgebung
 */
export class KEIStreamClient {
  private ws?: WebSocket;
  private connected = false;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;

  // Event-Listener-Management
  private listeners: Map<string, Set<KEIStreamListener>> = new Map();
  private globalListeners: Set<KEIStreamListener> = new Set();

  // Stream-Management
  private lastSeqByStream: Map<string, number> = new Map();
  private creditWindowByStream: Map<string, number> = new Map();
  private pendingByStream: Map<string, KEIStreamFrame[]> = new Map();
  private recorderByStream: Map<string, KEIStreamFrame[]> = new Map();
  private tokenBucketManager: StreamTokenBucketManager;
  private inflightSinceAck: Map<string, number> = new Map();

  // Compression-Management
  private compressionManager: CompressionManager;
  
  // Reconnection-Management
  private shouldStop = false;
  private reconnectDelay: number;
  private reconnectAttempts = 0;
  
  // Status-Tracking
  private connectedAt?: Date;
  private lastError?: Error;
  private totalFramesSent = 0;
  private totalFramesReceived = 0;

  constructor(private config: KEIStreamClientConfig) {
    this.reconnectDelay = config.reconnectInitialMs ?? 1000;

    // Compression-Manager initialisieren
    this.compressionManager = getCompressionManager();

    // Token-Bucket-Manager initialisieren
    this.tokenBucketManager = new StreamTokenBucketManager({
      capacity: 100,
      refillRate: 50, // 50 Frames pro Sekunde
      frameCost: 1,
    });
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  /**
   * Stellt Verbindung zum KEI-Stream Server her
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.connectionState = ConnectionState.CONNECTING;
    this.lastError = undefined;

    try {
      // WebSocket-URL mit Authentifizierung aufbauen
      const url = new URL(this.config.url);
      if (this.config.apiToken) {
        url.searchParams.set('access_token', this.config.apiToken);
      }
      if (this.config.scopes?.length) {
        url.searchParams.set('scopes', this.config.scopes.join(' '));
      }
      if (this.config.tenantId) {
        url.searchParams.set('tenant_id', this.config.tenantId);
      }

      this.ws = new WebSocket(url.toString());

      // Verbindung herstellen
      await new Promise<void>((resolve, reject) => {
        if (!this.ws) {
          return reject(new Error('WebSocket nicht initialisiert'));
        }

        this.ws.onopen = () => {
          this.connected = true;
          this.connectionState = ConnectionState.CONNECTED;
          this.connectedAt = new Date();
          this.reconnectAttempts = 0;
          this.reconnectDelay = this.config.reconnectInitialMs ?? 1000;
          resolve();
        };

        this.ws.onerror = (event) => {
          const error = new Error('WebSocket Verbindungsfehler');
          this.lastError = error;
          this.connectionState = ConnectionState.ERROR;
          reject(error);
        };

        // Timeout für Verbindungsaufbau
        setTimeout(() => {
          if (this.connectionState === ConnectionState.CONNECTING) {
            reject(new Error('Verbindungs-Timeout'));
          }
        }, 10000);
      });

      // Event-Handler registrieren
      this.setupEventHandlers();
      
      // Nach Verbindungsaufbau: Resume für alle bekannten Streams
      this.resumeAllStreams();
      
      // Drain-Loop starten
      this.startDrainLoop();

    } catch (error) {
      this.lastError = error as Error;
      this.connectionState = ConnectionState.ERROR;
      throw error;
    }
  }

  /**
   * Trennt die Verbindung zum KEI-Stream Server
   */
  async disconnect(): Promise<void> {
    this.shouldStop = true;
    this.connectionState = ConnectionState.DISCONNECTED;
    
    if (this.ws && this.connected) {
      this.ws.close();
    }
    
    this.connected = false;
    this.ws = undefined;
  }

  /**
   * Registriert Listener für spezifischen Stream
   */
  on(streamId: string, listener: KEIStreamListener): () => void {
    const set = this.listeners.get(streamId) ?? new Set<KEIStreamListener>();
    set.add(listener);
    this.listeners.set(streamId, set);
    
    // Cleanup-Funktion zurückgeben
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(streamId);
      }
    };
  }

  /**
   * Registriert globalen Listener für alle Frames
   */
  onAny(listener: KEIStreamListener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  /**
   * Sendet Frame an spezifischen Stream
   */
  async send(streamId: string, type: FrameType, payload?: Record<string, any>): Promise<void> {
    // Frame mit Tracing-Instrumentierung erstellen
    const baseFrame: KEIStreamFrame = {
      type,
      stream_id: streamId,
      headers: {},
      payload: payload ?? {},
      ts: new Date().toISOString(),
    };

    // Frame mit Tracing instrumentieren
    let instrumentedFrame = instrumentFrame(baseFrame, `kei-stream.send.${type}`);

    // Frame komprimieren (falls konfiguriert)
    try {
      instrumentedFrame = await this.compressionManager.compressFrame(
        instrumentedFrame,
        this.config.tenantId,
        this.config.apiToken
      );
    } catch (error) {
      console.warn('⚠️ Frame-Compression fehlgeschlagen:', error);
      // Fallback: unkomprimiertes Frame verwenden
    }

    // Frame zur Warteschlange hinzufügen
    const queue = this.pendingByStream.get(streamId) ?? [];
    queue.push(instrumentedFrame);
    this.pendingByStream.set(streamId, queue);

    // Sofort versuchen zu senden (mit Tracing)
    traceStreamOperation(
      'kei-stream.drain',
      streamId,
      () => this.tryDrainStream(streamId),
      { 'frame.type': type, 'frame.queued': queue.length }
    );
  }

  /**
   * Replay von aufgezeichneten Frames seit bestimmter Sequenznummer
   */
  replay(streamId: string, sinceSeq: number): KEIStreamFrame[] {
    const recorded = this.recorderByStream.get(streamId) ?? [];
    return recorded.filter((frame) => (frame.seq ?? 0) > sinceSeq);
  }

  /**
   * Gibt aktuellen Client-Status zurück
   */
  getStatus(): KEIStreamClientStatus {
    const streams = new Map<string, StreamStatus>();
    
    // Stream-Status für alle aktiven Streams sammeln
    for (const [streamId, lastSeq] of this.lastSeqByStream) {
      const pending = this.pendingByStream.get(streamId)?.length ?? 0;
      const credit = this.creditWindowByStream.get(streamId) ?? 0;
      
      streams.set(streamId, {
        streamId,
        lastSeq,
        creditWindow: credit,
        pendingFrames: pending,
        lastActivity: new Date(), // TODO: Echte letzte Aktivität tracken
        isActive: pending > 0 || credit > 0,
      });
    }

    return {
      connectionState: this.connectionState,
      connectedAt: this.connectedAt,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
      streams,
      totalFramesSent: this.totalFramesSent,
      totalFramesReceived: this.totalFramesReceived,
      tokenBuckets: this.tokenBucketManager.getAllStatus(),
      compressionStats: this.compressionManager.getCompressionStats(),
    };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Richtet WebSocket Event-Handler ein
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.connected = true;
      this.connectionState = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      this.emit('connected');

      console.debug('✅ KEI-Stream WebSocket verbunden');
    };

    this.ws.onmessage = async (event) => {
      try {
        const frame = JSON.parse(event.data) as KEIStreamFrame;
        await this.handleIncomingFrame(frame);
        this.emit('frame', frame);
      } catch (error) {
        console.error('❌ Fehler beim Parsen der WebSocket-Message:', error);
        this.emit('error', new Error(`Message parse error: ${error}`));
      }
    };

    this.ws.onclose = (event) => {
      this.connected = false;
      const wasConnected = this.connectionState === ConnectionState.CONNECTED;
      this.connectionState = ConnectionState.DISCONNECTED;

      console.debug(`🔌 KEI-Stream WebSocket getrennt (Code: ${event.code})`);
      this.emit('disconnected', event.reason);

      // Automatische Wiederverbindung wenn nicht manuell getrennt
      if (wasConnected && !this.shouldStop && event.code !== 1000) {
        console.debug('🔄 Starte automatische Wiederverbindung...');
        this.handleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      this.lastError = new Error('WebSocket connection error');
      this.connectionState = ConnectionState.ERROR;

      console.error('❌ KEI-Stream WebSocket Fehler:', error);
      this.emit('error', this.lastError);

      // Automatische Wiederverbindung bei Fehlern
      if (!this.shouldStop) {
        this.handleReconnect();
      }
    };
  }

  /**
   * Verarbeitet eingehende KEI-Stream Frames
   */
  private async handleIncomingFrame(frame: KEIStreamFrame): Promise<void> {
    this.totalFramesReceived++;
    const streamId = frame.stream_id || 'default';

    // Frame dekomprimieren (falls komprimiert)
    let processedFrame = frame;
    try {
      processedFrame = await this.compressionManager.decompressFrame(frame);
    } catch (error) {
      console.warn('⚠️ Frame-Decompression fehlgeschlagen:', error);
      // Fallback: ursprüngliches Frame verwenden
    }

    // Frame aufzeichnen für Replay-Funktionalität
    this.recordFrame(streamId, processedFrame);

    // Letzte Sequenznummer aktualisieren
    if (typeof processedFrame.seq === 'number') {
      this.lastSeqByStream.set(streamId, processedFrame.seq);
    }

    // Spezielle Frame-Typen behandeln
    switch (frame.type) {
      case FrameType.ACK:
        if (frame.ack) {
          this.handleAckFrame(streamId, frame);
        }
        return;

      case FrameType.RESUME:
        // Resume-Bestätigung vom Backend verarbeiten
        this.handleResumeAck(frame);
        return;

      case FrameType.HEARTBEAT:
        // Heartbeat beantworten
        this.sendRawFrame({
          type: FrameType.HEARTBEAT,
          stream_id: streamId,
          ts: new Date().toISOString(),
        });
        break;

      case FrameType.ERROR:
        // Error-Frames speziell behandeln
        console.error(`❌ KEI-Stream Error in ${streamId}:`, frame.error);
        this.emit('error', new Error(frame.error?.message || 'Unknown stream error'));
        break;
    }

    // Frame an Listener weiterleiten
    this.notifyListeners(streamId, frame);

    // ACK für normale Frames senden (Flow-Control)
    this.maybeAckFrame(streamId, frame.seq ?? 0);
  }

  /**
   * Zeichnet Frame für Replay-Funktionalität auf
   */
  private recordFrame(streamId: string, frame: KEIStreamFrame): void {
    const recorded = this.recorderByStream.get(streamId) ?? [];
    recorded.push(frame);
    
    // Begrenzte Anzahl von Frames behalten (Memory-Management)
    if (recorded.length > 1000) {
      recorded.shift();
    }
    
    this.recorderByStream.set(streamId, recorded);
  }

  /**
   * Verarbeitet ACK-Frames für Flow-Control
   */
  private handleAckFrame(streamId: string, frame: KEIStreamFrame): void {
    if (frame.ack?.credit !== undefined) {
      this.creditWindowByStream.set(streamId, frame.ack.credit);
      this.tryDrainStream(streamId);
    }
  }

  /**
   * Benachrichtigt alle registrierten Listener
   */
  private notifyListeners(streamId: string, frame: KEIStreamFrame): void {
    // Stream-spezifische Listener
    const streamListeners = this.listeners.get(streamId);
    if (streamListeners) {
      for (const listener of streamListeners) {
        try {
          listener(frame);
        } catch (error) {
          console.warn('Fehler in Stream-Listener:', error);
        }
      }
    }

    // Globale Listener
    for (const listener of this.globalListeners) {
      try {
        listener(frame);
      } catch (error) {
        console.warn('Fehler in globalem Listener:', error);
      }
    }
  }

  /**
   * Sendet ACK-Frame wenn nötig (Flow-Control)
   */
  private maybeAckFrame(streamId: string, ackSeq: number): void {
    const ackEvery = this.config.ackEvery ?? 5;
    const creditTarget = this.config.ackCreditTarget ?? 16;
    const inflightCount = (this.inflightSinceAck.get(streamId) ?? 0) + 1;

    if (inflightCount >= ackEvery) {
      this.inflightSinceAck.set(streamId, 0);
      this.sendRawFrame({
        type: FrameType.ACK,
        stream_id: streamId,
        ack: {
          ack_seq: ackSeq,
          credit: creditTarget,
        },
        ts: new Date().toISOString(),
      });
    } else {
      this.inflightSinceAck.set(streamId, inflightCount);
    }
  }

  /**
   * Fügt Tracing-Header hinzu (falls verfügbar)
   */
  private injectTraceHeaders(headers: HeadersDict): HeadersDict {
    // OpenTelemetry-Integration für W3C Trace Propagation
    return injectTraceHeaders(headers);
  }

  /**
   * Sendet Resume-Frames für alle bekannten Streams bei Reconnect
   *
   * Implementiert vollständige Backend-Kompatibilität mit SessionManager.
   * Sendet RESUME-Frames mit korrekter Payload-Struktur für Session-Wiederherstellung.
   */
  private resumeAllStreams(): void {
    if (this.lastSeqByStream.size === 0) {
      return;
    }

    console.debug(`🔄 Resuming ${this.lastSeqByStream.size} streams nach Reconnect`);

    for (const [streamId, lastSeq] of this.lastSeqByStream) {
      // Backend-kompatible Resume-Frame-Struktur
      const resumeFrame: KEIStreamFrame = {
        type: FrameType.RESUME,
        stream_id: streamId,
        seq: lastSeq,
        ts: new Date().toISOString(),
        headers: this.injectTraceHeaders({}),
        payload: {
          stream_id: streamId,
          last_seq: lastSeq,
          session_id: this.config.sessionId,
        },
      };

      this.sendRawFrame(resumeFrame);

      console.debug(`📤 Resume gesendet für Stream ${streamId}, lastSeq: ${lastSeq}`);
    }
  }

  /**
   * Behandelt automatische Wiederverbindung mit Resume-Logic
   *
   * Diese Methode wird bei Verbindungsabbruch aufgerufen und implementiert
   * exponential backoff mit automatischer Stream-Wiederherstellung.
   */
  private async handleReconnect(): Promise<void> {
    if (this.shouldStop || this.connectionState === ConnectionState.CONNECTED) {
      return;
    }

    this.connectionState = ConnectionState.RECONNECTING;

    const delay = Math.min(
      this.config.reconnectInitialMs! * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxMs!
    );

    console.debug(`🔄 Reconnect-Versuch ${this.reconnectAttempts + 1} in ${delay}ms`);

    await new Promise(resolve => setTimeout(resolve, delay));
    this.reconnectAttempts++;

    try {
      await this.connect();
      console.debug('✅ Reconnect erfolgreich, Resume-Logic wird ausgeführt');
    } catch (error) {
      console.error('❌ Reconnect fehlgeschlagen:', error);

      if (this.reconnectAttempts < 10 && !this.shouldStop) {
        // Weitere Reconnect-Versuche
        this.handleReconnect();
      } else {
        this.connectionState = ConnectionState.ERROR;
        this.emit('error', new Error('Max reconnect attempts reached'));
      }
    }
  }

  /**
   * Verarbeitet eingehende RESUME-Bestätigung vom Backend
   *
   * Synchronisiert lokalen State mit Backend-Session-State nach Resume.
   */
  private handleResumeAck(frame: KEIStreamFrame): void {
    const streamId = frame.stream_id;
    const resumedSeq = frame.seq || 0;

    console.debug(`✅ Resume bestätigt für Stream ${streamId}, Seq: ${resumedSeq}`);

    // Lokale Sequenznummer mit Backend synchronisieren
    this.lastSeqByStream.set(streamId, resumedSeq);

    // Credit-Window für Stream zurücksetzen
    const creditTarget = this.config.ackCreditTarget ?? 16;
    this.creditWindowByStream.set(streamId, creditTarget);

    // Pending-Frames für diesen Stream verarbeiten
    this.tryDrainStream(streamId);
  }

  /**
   * Versucht ausstehende Frames für einen Stream zu senden
   *
   * Implementiert Credit-basiertes Flow-Control und Token-Bucket Rate-Limiting
   * für faire Ressourcenverteilung zwischen Streams.
   */
  private tryDrainStream(streamId: string): void {
    if (!this.connected || !this.ws) return;

    const queue = this.pendingByStream.get(streamId) ?? [];
    if (queue.length === 0) return;

    let credits = this.creditWindowByStream.get(streamId) ??
                  (this.config.ackCreditTarget ?? 16);

    while (queue.length > 0 && credits > 0) {
      // Token-Bucket Rate-Limiting prüfen
      if (!this.tokenBucketManager.tryConsumeForStream(streamId)) {
        console.debug(`🚫 Rate-Limit erreicht für Stream ${streamId}`);
        break;
      }

      const frame = queue.shift()!;

      // Sequenznummer zuweisen
      const nextSeq = (this.lastSeqByStream.get(streamId) ?? 0) + 1;
      frame.seq = nextSeq;
      this.lastSeqByStream.set(streamId, nextSeq);

      // Kredit optimistisch dekrementieren
      this.creditWindowByStream.set(streamId, Math.max(0, credits - 1));
      credits = Math.max(0, credits - 1);

      // Frame senden
      this.sendRawFrame(frame);
      this.totalFramesSent++;

      console.debug(`📤 Frame gesendet: ${streamId}#${nextSeq} (${frame.type})`);
    }

    // Queue-Status aktualisieren
    this.pendingByStream.set(streamId, queue);
  }

  /**
   * Startet periodischen Drain-Loop für alle Streams
   */
  private startDrainLoop(): void {
    if (this.shouldStop) return;

    // Alle Streams periodisch drainen
    for (const streamId of this.pendingByStream.keys()) {
      this.tryDrainStream(streamId);
    }

    setTimeout(() => this.startDrainLoop(), 50);
  }

  /**
   * Plant automatische Wiederverbindung
   */
  private scheduleReconnect(): void {
    const maxDelay = this.config.reconnectMaxMs ?? 10000;
    const delay = this.reconnectDelay;
    
    this.reconnectDelay = Math.min(maxDelay, Math.floor(this.reconnectDelay * 1.5));
    this.reconnectAttempts++;

    setTimeout(() => {
      if (this.shouldStop) return;
      
      this.connect().catch(() => {
        // Bei Fehler erneut versuchen
        this.scheduleReconnect();
      });
    }, delay);
  }

  /**
   * Sendet Frame direkt über WebSocket
   */
  private sendRawFrame(frame: KEIStreamFrame): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    try {
      this.ws.send(JSON.stringify(frame));
      this.totalFramesSent++;
    } catch (error) {
      console.warn('Fehler beim Senden des Frames:', error);
    }
  }
}
