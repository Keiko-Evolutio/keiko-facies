// src/websocket/typed-client.ts
/**
 * Type-Safe WebSocket Client für Keiko Personal Assistant
 *
 * Dieser Client bietet vollständige Type Safety für alle WebSocket-Events
 * und automatische Wiederverbindung mit exponential backoff.
 *
 * Features:
 * - Vollständige TypeScript Type Safety
 * - Automatische Reconnection mit exponential backoff
 * - Health Monitoring und Latenz-Messung
 * - Message Queuing für Offline-Nachrichten
 * - Event-basierte Architektur
 * - Umfassende Error-Behandlung
 *
 * @version 2.1.0
 */

import { v4 as uuidv4 } from 'uuid';
import {
  type AgentInputEvent,
  type ClientToServerEvent,
  createEvent,
  type EventType,
  type ExtendedEventHandlerMap,
  type ExtendedWebSocketClientConfig,
  type ExtendedWebSocketManager,
  type ExtendedWebSocketState,
  type FunctionConfirmationEvent,
  mergeWithDefaults,
  type PingEvent,
  type QueuedMessage,
  type ServerToClientEvent,
  type SubscribeEventsEvent,
  validateExtendedConfig,
  type VoiceInputEvent,
  WebSocketConnectionError,
  type WebSocketConnectionHealth,
  WebSocketExtendedError,
  WebSocketTimeoutError,
} from '../types/websocket-extended';

/**
 * Enhanced Type-Safe WebSocket Client
 */
export class TypedWebSocketClient implements ExtendedWebSocketManager {
  private websocket: WebSocket | null = null;
  private config: ExtendedWebSocketClientConfig;

  // State management
  private state: ExtendedWebSocketState;
  private health: WebSocketConnectionHealth;

  // Event handling
  private eventHandlers: Partial<
    Record<
      keyof ExtendedEventHandlerMap,
      Array<ExtendedEventHandlerMap[keyof ExtendedEventHandlerMap]>
    >
  > = {};

  // Connection management
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isReconnecting = false;
  private shouldReconnect = true;
  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;

  // Health monitoring
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPings = new Map<string, Date>();
  // FIX: Entfernt unused lastPingTime
  // private lastPingTime: Date | null = null;

  // Message queueing
  private messageQueue: QueuedMessage[] = [];
  private isProcessingQueue = false;

  constructor(config: Partial<ExtendedWebSocketClientConfig>) {
    this.config = mergeWithDefaults(config);
    validateExtendedConfig(this.config);

    // Initialize state
    this.state = {
      status: 'disconnected',
      isConnected: false,
      lastConnected: null,
      lastDisconnected: null,
      reconnectAttempts: 0,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      error: null,
      subscribedEvents: this.config.subscribedEvents || [],
    };

    // Initialize health
    this.health = {
      isHealthy: false,
      latency: null,
      lastPing: null,
      lastPong: null,
      consecutiveFailures: 0,
      uptime: 0,
      totalReconnects: 0,
      messagesReceived: 0,
      messagesSent: 0,
    };

    this.log('debug', 'TypedWebSocketClient initialized', { config: this.config });
  }

  // =============================================================================
  // PUBLIC INTERFACE
  // =============================================================================

  async connect(): Promise<void> {
    if (this.state.isConnected) {
      this.log('warn', 'Already connected');
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.performConnect();
    });

    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    this.clearTimers();

    if (this.websocket) {
      this.websocket.close(1000, 'Client disconnect');
      this.websocket = null;
    }

    this.updateState({
      status: 'disconnected',
      isConnected: false,
      lastDisconnected: new Date(),
    });

    this.log('info', 'WebSocket disconnected by client');
  }

  async reconnect(): Promise<void> {
    await this.disconnect();
    this.state.reconnectAttempts = 0;
    this.shouldReconnect = true;
    return this.connect();
  }

  getState(): ExtendedWebSocketState {
    return { ...this.state };
  }

  getHealth(): WebSocketConnectionHealth {
    return { ...this.health };
  }

  isConnected(): boolean {
    return this.state.isConnected && this.websocket?.readyState === WebSocket.OPEN;
  }

  // =============================================================================
  // MESSAGE SENDING
  // =============================================================================

  async send(event: ClientToServerEvent): Promise<boolean> {
    if (!this.isConnected()) {
      if (this.config.messageQueueEnabled) {
        this.queueMessage(event);
        return false;
      }
      throw new WebSocketConnectionError('Not connected to WebSocket server');
    }

    try {
      const message = JSON.stringify(event);
      this.websocket!.send(message);
      this.health.messagesSent++;
      this.log('debug', 'Message sent', { event: event.event_type });
      return true;
    } catch (error) {
      this.log('error', 'Failed to send message', { error, event });
      throw new WebSocketExtendedError(`Failed to send message: ${error}`);
    }
  }

  sendAgentInput(message: string, metadata?: Record<string, any>): void {
    const event = createEvent<AgentInputEvent>({
      event_type: 'agent_input',
      message,
      metadata,
    });
    this.send(event);
  }

  sendVoiceInput(text: string, metadata?: Record<string, any>): void {
    const event = createEvent<VoiceInputEvent>({
      event_type: 'voice_input',
      text,
      metadata,
    });
    this.send(event);
  }

  confirmFunction(functionCallId: string, confirmed: boolean, reason?: string): void {
    const event = createEvent<FunctionConfirmationEvent>({
      event_type: 'function_confirmation',
      function_call_id: functionCallId,
      confirmed,
      reason,
    });
    this.send(event);
  }

  subscribeToEvents(events: EventType[]): void {
    if (!this.isConnected()) {
      this.state.subscribedEvents = [...events];
      return;
    }

    // FIX: Verwende SubscribeEventsEvent-Typ mit korrekten Properties
    const subscribeEvent: SubscribeEventsEvent = createEvent({
      event_type: 'subscribe_events' as const,
      events, // FIX: events property hinzugefügt
    });

    this.send(subscribeEvent);
    this.state.subscribedEvents = [...events];
  }

  unsubscribeFromEvents(events: EventType[]): void {
    this.state.subscribedEvents = this.state.subscribedEvents.filter(
      (event) => !events.includes(event),
    );
  }

  // =============================================================================
  // EVENT HANDLING
  // =============================================================================

  on<K extends keyof ExtendedEventHandlerMap>(event: K, handler: ExtendedEventHandlerMap[K]): void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event]!.push(handler);
  }

  off<K extends keyof ExtendedEventHandlerMap>(
    event: K,
    handler?: ExtendedEventHandlerMap[K],
  ): void {
    if (!this.eventHandlers[event]) return;

    if (handler) {
      const index = this.eventHandlers[event]!.indexOf(handler);
      if (index > -1) {
        this.eventHandlers[event]!.splice(index, 1);
      }
    } else {
      delete this.eventHandlers[event];
    }
  }

  emit<K extends keyof ExtendedEventHandlerMap>(
    event: K,
    ...args: Parameters<ExtendedEventHandlerMap[K]>
  ): void {
    const handlers = this.eventHandlers[event];
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          (handler as any)(...args);
        } catch (error) {
          this.log('error', `Error in event handler for ${String(event)}`, { error });
        }
      });
    }
  }

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  async ping(): Promise<number> {
    if (!this.isConnected()) {
      throw new WebSocketConnectionError('Not connected');
    }

    const clientTime = new Date().toISOString();
    this.pendingPings.set(clientTime, new Date());

    const pingEvent = createEvent<PingEvent>({
      event_type: 'ping',
      client_time: clientTime,
    });

    await this.send(pingEvent);
    this.health.lastPing = new Date();

    // Set ping timeout
    this.pingTimeoutTimer = setTimeout(() => {
      this.pendingPings.delete(clientTime);
      this.health.consecutiveFailures++;
      this.log('warn', 'Ping timeout');
    }, this.config.pingTimeout);

    return new Promise((resolve) => {
      const checkPong = () => {
        if (!this.pendingPings.has(clientTime)) {
          resolve(this.health.latency || -1);
        } else {
          setTimeout(checkPong, 100);
        }
      };
      checkPong();
    });
  }

  destroy(): void {
    this.shouldReconnect = false;
    this.clearTimers();

    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    this.eventHandlers = {};
    this.messageQueue = [];
    this.pendingPings.clear();

    this.log('info', 'WebSocket client destroyed');
  }

  private performConnect(): void {
    if (this.websocket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.updateState({ status: 'connecting' });
    this.log('info', 'Connecting to WebSocket', { url: this.config.url });

    try {
      this.websocket = new WebSocket(this.config.url, this.config.protocols);
      this.setupWebSocketEventHandlers();
    } catch (error) {
      this.handleConnectionError(
        new WebSocketConnectionError(`Failed to create WebSocket: ${error}`),
      );
    }
  }

  private setupWebSocketEventHandlers(): void {
    if (!this.websocket) return;

    // FIX: Entfernt unused parameter 'event'
    const onError = () => {
      this.handleConnectionError(new WebSocketConnectionError('WebSocket connection error'));
    };

    this.websocket.onopen = () => {
      this.handleConnectionOpen();
    };

    this.websocket.onclose = (event) => {
      this.handleConnectionClose(event);
    };

    this.websocket.onerror = onError;

    this.websocket.onmessage = (event) => {
      this.handleMessage(event);
    };

    // Set connection timeout
    setTimeout(() => {
      if (this.websocket?.readyState === WebSocket.CONNECTING) {
        this.websocket.close();
        this.handleConnectionError(new WebSocketTimeoutError('Connection timeout'));
      }
    }, this.config.connectionTimeout);
  }

  private handleConnectionOpen(): void {
    this.updateState({
      status: 'connected',
      isConnected: true,
      lastConnected: new Date(),
      reconnectAttempts: 0,
      error: null,
    });

    this.health.isHealthy = true;
    this.health.consecutiveFailures = 0;
    this.health.lastPing = new Date();

    this.connectPromise = null;
    this.connectResolve?.();
    this.connectResolve = null;
    this.connectReject = null;

    this.log('info', 'WebSocket connected successfully');
    this.emit('connected');

    // Start health monitoring
    this.startHealthMonitoring();

    // Process queued messages
    this.processMessageQueue();

    // Restore event subscriptions
    if (this.state.subscribedEvents.length > 0) {
      this.subscribeToEvents(this.state.subscribedEvents);
    }
  }

  private handleConnectionClose(event: CloseEvent): void {
    this.clearTimers();

    this.updateState({
      status: 'disconnected',
      isConnected: false,
      lastDisconnected: new Date(),
    });

    this.health.isHealthy = false;

    this.log('info', 'WebSocket connection closed', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });

    this.emit('disconnected', event.reason);

    if (this.shouldReconnect && this.config.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);

      this.health.messagesReceived++;
      this.log('debug', 'Message received', { event: data.event_type });

      // FIX: Vereinfachte Type-Behandlung - prüfe direkt auf Client-Events
      const isClientEvent = [
        'agent_input',
        'voice_input',
        'subscribe_events',
        'function_confirmation',
        'ping',
      ].includes(data.event_type);

      // Wenn es kein Client-Event ist, behandle es als Server-Event
      if (!isClientEvent) {
        this.handleServerEvent(data as ServerToClientEvent);
      }
    } catch (error) {
      this.log('error', 'Failed to parse message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        data: event.data,
      });
      this.health.consecutiveFailures++;
    }
  }

  private handleServerEvent(event: ServerToClientEvent): void {
    // Handle special events
    switch (event.event_type) {
      case 'pong':
        this.handlePongEvent(event);
        break;
      case 'error':
        this.handleServerError(event);
        break;
      case 'connection_status':
        this.handleConnectionStatus(event);
        break;
    }

    // Emit specific event handlers
    const specificHandlers = this.eventHandlers[event.event_type];
    if (specificHandlers) {
      specificHandlers.forEach((handler) => {
        try {
          (handler as any)(event);
        } catch (error) {
          this.log('error', `Error in ${event.event_type} handler`, { error });
        }
      });
    }

    // Emit generic handlers
    this.emit('message', event);
    this.emit('all', event);
  }

  private handlePongEvent(event: any): void {
    const pingTime = this.pendingPings.get(event.client_time);
    if (pingTime) {
      this.health.latency = Date.now() - pingTime.getTime();
      this.pendingPings.delete(event.client_time);
      this.log('debug', 'Ping/Pong completed', { latency: this.health.latency });
    }

    this.health.lastPong = new Date();
    clearTimeout(this.pingTimeoutTimer!);
  }

  private handleServerError(event: any): void {
    const error = new WebSocketExtendedError(
      event.message || 'Server error',
      event.error_code || 'SERVER_ERROR',
      event.recoverable !== false,
    );

    this.log('error', 'Server error received', { event });
    this.emit('error', error);
  }

  // =============================================================================
  // RECONNECTION LOGIC
  // =============================================================================

  private handleConnectionStatus(event: any): void {
    this.log('info', 'Connection status update', { status: event.status });
  }

  // =============================================================================
  // HEALTH MONITORING
  // =============================================================================

  private handleConnectionError(error: Error): void {
    this.log('error', 'Connection error', { error: error.message });

    this.updateState({ error });
    this.health.consecutiveFailures++;
    this.health.isHealthy = false;

    this.emit('error', error);
    this.connectReject?.(error);
    this.connectPromise = null;
    this.connectResolve = null;
    this.connectReject = null;
  }

  private scheduleReconnect(): void {
    if (this.isReconnecting || this.state.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log('warn', 'Max reconnect attempts reached');
      return;
    }

    this.isReconnecting = true;
    this.updateState({ status: 'reconnecting' });

    const delay = Math.min(
      this.config.reconnectBaseDelay *
        Math.pow(this.config.reconnectBackoffFactor, this.state.reconnectAttempts),
      this.config.maxReconnectDelay,
    );

    this.log('info', `Scheduling reconnect attempt ${this.state.reconnectAttempts + 1}`, { delay });
    this.emit('reconnecting', this.state.reconnectAttempts + 1);

    this.reconnectTimer = setTimeout(() => {
      this.state.reconnectAttempts++;
      this.health.totalReconnects++;
      this.isReconnecting = false;
      this.performConnect();
    }, delay);
  }

  private startHealthMonitoring(): void {
    this.pingTimer = setInterval(() => {
      this.ping();
    }, this.config.pingInterval);

    this.healthTimer = setInterval(() => {
      this.updateHealthMetrics();
    }, this.config.healthCheckInterval);
  }

  // =============================================================================
  // MESSAGE QUEUE
  // =============================================================================

  private updateHealthMetrics(): void {
    if (this.state.lastConnected) {
      this.health.uptime = Date.now() - this.state.lastConnected.getTime();
    }

    // Check if connection is still healthy
    const now = new Date();
    const lastActivity = this.health.lastPong || this.health.lastPing;

    if (lastActivity && now.getTime() - lastActivity.getTime() > this.config.pingInterval * 2) {
      this.health.isHealthy = false;
    }
  }

  private queueMessage(event: ClientToServerEvent): void {
    if (this.messageQueue.length >= this.config.maxQueuedMessages) {
      this.messageQueue.shift(); // Remove oldest message
    }

    const queuedMessage: QueuedMessage = {
      id: uuidv4(),
      event,
      timestamp: new Date(),
      retries: 0,
      maxRetries: this.config.messageRetryLimit,
    };

    this.messageQueue.push(queuedMessage);
    this.log('debug', 'Message queued', { messageId: queuedMessage.id });
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()!;

      try {
        await this.send(message.event);
        this.log('debug', 'Queued message sent', { messageId: message.id });
      } catch (error) {
        message.retries++;

        if (message.retries < message.maxRetries) {
          this.messageQueue.unshift(message); // Put back at front
          this.log('warn', 'Failed to send queued message, retrying', {
            messageId: message.id,
            retries: message.retries,
          });
          break;
        } else {
          this.log('error', 'Failed to send queued message, max retries reached', {
            messageId: message.id,
          });
        }
      }
    }

    this.isProcessingQueue = false;
  }

  private updateState(updates: Partial<ExtendedWebSocketState>): void {
    this.state = { ...this.state, ...updates };
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pingTimeoutTimer) {
      clearTimeout(this.pingTimeoutTimer);
      this.pingTimeoutTimer = null;
    }
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (!this.config.debug && level === 'debug') return;

    const logLevel = ['error', 'warn', 'info', 'debug'].indexOf(this.config.logLevel);
    const messageLevel = ['error', 'warn', 'info', 'debug'].indexOf(level);

    if (messageLevel <= logLevel) {
      console[level](`[WebSocket] ${message}`, data || '');
    }
  }
}
