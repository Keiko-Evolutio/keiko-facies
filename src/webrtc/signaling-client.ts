/**
 * WebRTC Signaling Client für Voice-Service-System
 * 
 * Behandelt WebSocket-basierte Signaling-Kommunikation für WebRTC-Verbindungen.
 * Unterstützt Offer/Answer-Austausch und ICE Candidate-Handling.
 * 
 * @version 1.0.0
 */

import type { 
  SignalingMessage, 
  OfferMessage, 
  AnswerMessage, 
  IceCandidateMessage,
  ErrorMessage,
  WebRTCEventMap 
} from './types';

// =============================================================================
// Event Emitter für Signaling
// =============================================================================

class SignalingEventEmitter {
  private listeners: Map<string, Function[]> = new Map();

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

  emit<K extends keyof WebRTCEventMap>(event: K, data: WebRTCEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Fehler in Event Listener für ${event}:`, error);
        }
      });
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

// =============================================================================
// Signaling Client Configuration
// =============================================================================

export interface SignalingClientConfig {
  /** WebSocket URL für Signaling Server */
  url: string;
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
  /** Heartbeat Interval in ms */
  heartbeatInterval: number;
  /** Debug Logging aktiviert */
  enableDebugLogging: boolean;
}

// =============================================================================
// Signaling Client State
// =============================================================================

export type SignalingState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface SignalingClientState {
  state: SignalingState;
  isConnected: boolean;
  reconnectAttempts: number;
  lastError: Error | null;
  lastPing: number | null;
  lastPong: number | null;
}

// =============================================================================
// WebRTC Signaling Client
// =============================================================================

export class WebRTCSignalingClient extends SignalingEventEmitter {
  private config: SignalingClientConfig;
  private websocket: WebSocket | null = null;
  private state: SignalingClientState;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: SignalingClientConfig) {
    super();
    this.config = config;
    this.state = {
      state: 'disconnected',
      isConnected: false,
      reconnectAttempts: 0,
      lastError: null,
      lastPing: null,
      lastPong: null
    };

    this.log('debug', 'WebRTC Signaling Client initialisiert', { config });
  }

  // =============================================================================
  // Public API
  // =============================================================================

  /**
   * Verbindung zum Signaling Server herstellen
   */
  async connect(): Promise<void> {
    if (this.state.isConnected) {
      this.log('warn', 'Bereits mit Signaling Server verbunden');
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.performConnect();
    return this.connectionPromise;
  }

  /**
   * Verbindung zum Signaling Server trennen
   */
  async disconnect(): Promise<void> {
    this.clearTimers();
    this.updateState({ state: 'disconnected', isConnected: false });

    if (this.websocket) {
      this.websocket.close(1000, 'Client disconnect');
      this.websocket = null;
    }

    this.connectionPromise = null;
    this.log('info', 'Von Signaling Server getrennt');
  }

  /**
   * SDP Offer senden
   */
  async sendOffer(offer: RTCSessionDescriptionInit, audioConstraints?: MediaTrackConstraints): Promise<void> {
    const message: OfferMessage = {
      type: 'offer',
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      timestamp: Date.now(),
      offer,
      audioConstraints
    };

    await this.sendMessage(message);
    this.log('debug', 'SDP Offer gesendet', { offer });
  }

  /**
   * SDP Answer senden
   */
  async sendAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    const message: AnswerMessage = {
      type: 'answer',
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      timestamp: Date.now(),
      answer
    };

    await this.sendMessage(message);
    this.log('debug', 'SDP Answer gesendet', { answer });
  }

  /**
   * ICE Candidate senden
   */
  async sendIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const message: IceCandidateMessage = {
      type: 'ice-candidate',
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      timestamp: Date.now(),
      candidate
    };

    await this.sendMessage(message);
    this.log('debug', 'ICE Candidate gesendet', { candidate });
  }

  /**
   * Error Message senden
   */
  async sendError(errorCode: string, errorMessage: string, errorDetails?: Record<string, any>): Promise<void> {
    const message: ErrorMessage = {
      type: 'error',
      sessionId: this.config.sessionId,
      userId: this.config.userId,
      timestamp: Date.now(),
      errorCode,
      errorMessage,
      errorDetails
    };

    await this.sendMessage(message);
    this.log('error', 'Error Message gesendet', { errorCode, errorMessage });
  }

  /**
   * Aktueller State
   */
  getState(): SignalingClientState {
    return { ...this.state };
  }

  /**
   * Ist verbunden
   */
  isConnected(): boolean {
    return this.state.isConnected;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async performConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.updateState({ state: 'connecting' });
        this.log('info', 'Verbinde mit Signaling Server', { url: this.config.url });

        this.websocket = new WebSocket(this.config.url);
        this.setupWebSocketEventHandlers(resolve, reject);

        // Connection Timeout
        const timeout = setTimeout(() => {
          if (this.websocket && this.websocket.readyState === WebSocket.CONNECTING) {
            this.websocket.close();
            reject(new Error('Signaling connection timeout'));
          }
        }, this.config.connectionTimeout);

        // Clear timeout on connection
        this.websocket.addEventListener('open', () => clearTimeout(timeout), { once: true });
        this.websocket.addEventListener('error', () => clearTimeout(timeout), { once: true });

      } catch (error) {
        this.handleConnectionError(error as Error);
        reject(error);
      }
    });
  }

  private setupWebSocketEventHandlers(resolve: () => void, reject: (error: Error) => void): void {
    if (!this.websocket) return;

    this.websocket.addEventListener('open', () => {
      this.updateState({ 
        state: 'connected', 
        isConnected: true, 
        reconnectAttempts: 0,
        lastError: null 
      });
      
      this.startHeartbeat();
      this.connectionPromise = null;
      
      this.log('info', 'Mit Signaling Server verbunden');
      this.emit('connection-state-change', { 
        state: 'connected', 
        previousState: 'connecting' 
      });
      
      resolve();
    });

    this.websocket.addEventListener('close', (event) => {
      this.updateState({ state: 'disconnected', isConnected: false });
      this.stopHeartbeat();
      
      this.log('info', 'Signaling Server Verbindung geschlossen', { 
        code: event.code, 
        reason: event.reason 
      });

      if (this.config.autoReconnect && event.code !== 1000) {
        this.scheduleReconnect();
      }

      this.emit('connection-state-change', { 
        state: 'disconnected', 
        previousState: 'connected' 
      });
    });

    this.websocket.addEventListener('error', (event) => {
      const error = new Error('WebSocket error');
      this.handleConnectionError(error);
      reject(error);
    });

    this.websocket.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });
  }

  private async sendMessage(message: SignalingMessage): Promise<void> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling Server nicht verbunden');
    }

    try {
      const messageString = JSON.stringify(message);
      this.websocket.send(messageString);
      this.log('debug', 'Signaling Message gesendet', { type: message.type });
    } catch (error) {
      this.log('error', 'Fehler beim Senden der Signaling Message', { error, message });
      throw error;
    }
  }

  private handleMessage(data: string): void {
    try {
      const message: SignalingMessage = JSON.parse(data);
      this.log('debug', 'Signaling Message empfangen', { type: message.type });

      // Handle Ping/Pong für Heartbeat
      if (message.type === 'ping') {
        this.handlePing();
        return;
      }

      if (message.type === 'pong') {
        this.handlePong();
        return;
      }

      // Emit Message-spezifische Events
      switch (message.type) {
        case 'offer':
          this.emit('offer-received', message as OfferMessage);
          break;
        case 'answer':
          this.emit('answer-received', message as AnswerMessage);
          break;
        case 'ice-candidate':
          this.emit('ice-candidate-received', message as IceCandidateMessage);
          break;
        case 'error':
          this.emit('error-received', message as ErrorMessage);
          break;
        default:
          this.log('warn', 'Unbekannter Message Type', { type: (message as any).type });
      }

    } catch (error) {
      this.log('error', 'Fehler beim Parsen der Signaling Message', { error, data });
    }
  }

  private handleConnectionError(error: Error): void {
    this.updateState({ 
      state: 'failed', 
      isConnected: false, 
      lastError: error 
    });
    
    this.log('error', 'Signaling Connection Error', { error });
    this.emit('error', { error, context: 'signaling-connection' });
  }

  private scheduleReconnect(): void {
    if (this.state.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log('error', 'Maximale Reconnect-Versuche erreicht');
      this.updateState({ state: 'failed' });
      return;
    }

    this.updateState({ 
      state: 'reconnecting',
      reconnectAttempts: this.state.reconnectAttempts + 1 
    });

    const delay = this.config.reconnectDelay * Math.pow(2, this.state.reconnectAttempts - 1);
    this.log('info', `Reconnect in ${delay}ms (Versuch ${this.state.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connectionPromise = null;
      this.connect().catch(error => {
        this.log('error', 'Reconnect fehlgeschlagen', { error });
      });
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendPing(): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const pingMessage = {
        type: 'ping',
        sessionId: this.config.sessionId,
        userId: this.config.userId,
        timestamp: Date.now()
      };
      
      this.websocket.send(JSON.stringify(pingMessage));
      this.updateState({ lastPing: Date.now() });
    }
  }

  private handlePing(): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const pongMessage = {
        type: 'pong',
        sessionId: this.config.sessionId,
        userId: this.config.userId,
        timestamp: Date.now()
      };
      
      this.websocket.send(JSON.stringify(pongMessage));
    }
  }

  private handlePong(): void {
    this.updateState({ lastPong: Date.now() });
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private updateState(updates: Partial<SignalingClientState>): void {
    this.state = { ...this.state, ...updates };
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (!this.config.enableDebugLogging && level === 'debug') {
      return;
    }

    const logMessage = `[WebRTC Signaling] ${message}`;
    
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
