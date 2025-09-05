// frontend/src/types/websocket.ts
/**
 * Base WebSocket Types for Keiko Personal Assistant
 *
 * Diese Datei wird automatisch generiert oder kann manuell gepflegt werden.
 * Sie enthält die grundlegenden WebSocket-Event-Typen für das System.
 *
 */

// =============================================================================
// BASE TYPES
// =============================================================================

export type EventType =
  | 'agent_input'
  | 'voice_input'
  | 'subscribe_events'
  | 'function_confirmation'
  | 'ping'
  | 'connection_status'
  | 'voice_response'
  | 'agent_response'
  | 'status_update'
  | 'error'
  | 'function_call'
  | 'function_result'
  | 'pong'
  | 'echo'
  | 'subscription_confirmed';

export type EventPriority = 'low' | 'normal' | 'high' | 'critical';
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

// =============================================================================
// BASE EVENT INTERFACE
// =============================================================================

export interface BaseWebSocketEvent {
  event_id: string;
  timestamp: string;
  priority?: EventPriority;
  session_id: string | null;
}

// =============================================================================
// CLIENT -> SERVER EVENTS
// =============================================================================

export interface AgentInputEvent extends BaseWebSocketEvent {
  event_type: 'agent_input';
  content: string;
  metadata?: Record<string, any>;
  context?: {
    conversation_id?: string;
    message_id?: string;
    parent_message_id?: string;
    user_id?: string;
  };
}

export interface VoiceInputEvent extends BaseWebSocketEvent {
  event_type: 'voice_input';
  text: string;
  metadata?: {
    confidence?: number;
    language?: string;
    audio_duration_ms?: number;
    voice_settings?: Record<string, any>;
  };
  audio_data?: string; // Base64 encoded audio data
  user_input?: Record<string, any>;
}

export interface SubscribeEventsMessage extends BaseWebSocketEvent {
  event_type: 'subscribe_events';
  event_types: EventType[];
  subscription_id: string;
  filter?: Record<string, any>;
}

export interface FunctionConfirmationEvent extends BaseWebSocketEvent {
  event_type: 'function_confirmation';
  function_call_id: string;
  confirmed: boolean;
  reason?: string;
  user_input?: Record<string, any>;
}

export interface PingEvent extends Omit<BaseWebSocketEvent, 'event_type'> {
  event_type: 'ping';
  client_timestamp?: string;
}

// =============================================================================
// SERVER -> CLIENT EVENTS
// =============================================================================

export interface ConnectionStatusEvent extends BaseWebSocketEvent {
  event_type: 'connection_status';
  status: ConnectionStatus;
  message: string;
  connection_id?: string;
  server_time?: string;
  server_info?: {
    name?: string;
    version?: string;
    capabilities?: string[];
  };
}

export interface VoiceResponseEvent extends BaseWebSocketEvent {
  event_type: 'voice_response';
  response: string;
  audio_url?: string;
  voice_settings?: {
    language: string;
    voice_id: string;
    speed: number;
    pitch: number;
  };
  original_message?: VoiceInputEvent;
}

export interface AgentResponseEvent extends BaseWebSocketEvent {
  event_type: 'agent_response';
  content: string;
  is_final: boolean;
  chunk_index?: number;
  total_chunks?: number;
  metadata?: {
    response_time_ms?: number;
    tokens_used?: number;
    model_used?: string;
    confidence_score?: number;
    citations?: Array<{
      source: string;
      url?: string;
      title?: string;
    }>;
  };
}

export interface StatusUpdateEvent extends BaseWebSocketEvent {
  event_type: 'status_update';
  status: string;
  progress?: number; // 0.0 - 1.0
  details?: string;
  message?: string;
  estimated_completion_ms?: number;
  stage?: string;
}

export interface ErrorEvent extends BaseWebSocketEvent {
  event_type: 'error';
  priority?: 'high' | 'critical';
  error_code: string;
  message: string;
  recoverable: boolean;
  retry_after_ms?: number;
  details?: Record<string, any>;
  stack_trace?: string;
}

export interface FunctionCallEvent extends BaseWebSocketEvent {
  event_type: 'function_call';
  function_call_id: string;
  function_name: string;
  arguments: Record<string, any>;
  requires_confirmation: boolean;
  description?: string;
  timeout_ms?: number;
  confirmation_prompt?: string;
}

export interface FunctionResultEvent extends BaseWebSocketEvent {
  event_type: 'function_result';
  function_call_id: string;
  function_name: string;
  result: any;
  success: boolean;
  error_message?: string;
  execution_time_ms?: number;
  metadata?: Record<string, any>;
}

export interface PongEvent extends BaseWebSocketEvent {
  event_type: 'pong';
  original_timestamp?: string;
  server_timestamp: string;
  roundtrip_ms?: number;
}

export interface EchoEvent extends BaseWebSocketEvent {
  event_type: 'echo';
  original_message: any;
  server_timestamp: string;
}

export interface SubscriptionConfirmedEvent extends BaseWebSocketEvent {
  event_type: 'subscription_confirmed';
  subscribed_events: EventType[];
  subscription_id: string;
  expires_at?: string;
}

// =============================================================================
// UNION TYPES
// =============================================================================

export type ClientToServerEvent =
  | VoiceInputEvent
  | AgentInputEvent
  | SubscribeEventsMessage
  | FunctionConfirmationEvent
  | PingEvent;

export type ServerToClientEvent =
  | ConnectionStatusEvent
  | VoiceResponseEvent
  | AgentResponseEvent
  | StatusUpdateEvent
  | ErrorEvent
  | FunctionCallEvent
  | FunctionResultEvent
  | PongEvent
  | EchoEvent
  | SubscriptionConfirmedEvent;

export type WebSocketEvent = ClientToServerEvent | ServerToClientEvent;

// =============================================================================
// CLIENT CONFIGURATION
// =============================================================================

export interface WebSocketClientConfig {
  /** WebSocket server URL */
  url: string;
  /** Unique connection identifier */
  connectionId: string;
  /** Session identifier */
  sessionId?: string;
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Base delay for exponential backoff (ms) */
  reconnectBaseDelay?: number;
  /** Maximum delay between reconnect attempts (ms) */
  maxReconnectDelay?: number;
  /** Connection timeout (ms) */
  connectionTimeout?: number;
  /** Ping interval for keepalive (ms) */
  pingInterval?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Authentication token */
  authToken?: string;
  /** Additional headers for connection */
  headers?: Record<string, string>;
}

// =============================================================================
// CLIENT STATE
// =============================================================================

export interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connectionId: string | null;
  sessionId: string | null;
  lastActivity: Date | null;
  messagesSent: number;
  messagesReceived: number;
  reconnectAttempts: number;
  roundtripLatency: number | null;
  subscribedEvents: EventType[];
  connectionStartedAt: Date | null;
  lastPingAt: Date | null;
  lastPongAt: Date | null;
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

export type EventHandler<T extends WebSocketEvent = WebSocketEvent> = (
  event: T,
) => void | Promise<void>;

export interface EventHandlerMap {
  // Connection events
  'connection:open': EventHandler<ConnectionStatusEvent>;
  'connection:close': EventHandler<ConnectionStatusEvent>;
  'connection:error': EventHandler<ErrorEvent>;
  'connection:reconnecting': EventHandler<ConnectionStatusEvent>;

  // Agent events
  'agent:response': EventHandler<AgentResponseEvent>;
  'agent:status': EventHandler<StatusUpdateEvent>;

  // Voice events
  'voice:response': EventHandler<VoiceResponseEvent>;

  // Function events
  'function:call': EventHandler<FunctionCallEvent>;
  'function:result': EventHandler<FunctionResultEvent>;

  // System events
  'system:error': EventHandler<ErrorEvent>;
  'system:pong': EventHandler<PongEvent>;
  'system:echo': EventHandler<EchoEvent>;
  'system:subscription_confirmed': EventHandler<SubscriptionConfirmedEvent>;

  // Generic event handler for all events
  message: EventHandler<WebSocketEvent>;
}

// =============================================================================
// CLIENT INTERFACE
// =============================================================================

export interface WebSocketManager {
  // Connection management
  connect(): Promise<void>;

  disconnect(): void;

  reconnect(): Promise<void>;

  // Message sending
  send<T extends ClientToServerEvent>(
    event: Omit<T, 'event_id' | 'timestamp' | 'session_id'>,
  ): void;

  sendRaw(data: string | ArrayBuffer | Blob): void;

  // Event handling
  on<K extends keyof EventHandlerMap>(eventType: K, handler: EventHandlerMap[K]): void;

  off<K extends keyof EventHandlerMap>(eventType: K, handler: EventHandlerMap[K]): void;

  once<K extends keyof EventHandlerMap>(eventType: K, handler: EventHandlerMap[K]): void;

  // Event subscriptions
  subscribeToEvents(eventTypes: EventType[]): void;

  unsubscribeFromEvents(eventTypes: EventType[]): void;

  // Utility methods
  isConnected(): boolean;

  getState(): Readonly<WebSocketState>;

  ping(): void;

  // Agent interaction helpers
  sendMessage(content: string, metadata?: Record<string, any>): void;

  sendVoiceInput(text: string, metadata?: Record<string, any>): void;

  confirmFunction(functionCallId: string, confirmed: boolean, reason?: string): void;
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

export class WebSocketError extends Error {
  public readonly recoverable: boolean;

  constructor(message: string, recoverable = true) {
    super(message);
    this.name = 'WebSocketError';
    this.recoverable = recoverable;
    Object.setPrototypeOf(this, WebSocketError.prototype);
  }
}

export class WebSocketConnectionError extends WebSocketError {
  constructor(message: string, recoverable = true) {
    super(message, recoverable);
    this.name = 'WebSocketConnectionError';
    Object.setPrototypeOf(this, WebSocketConnectionError.prototype);
  }
}

export class WebSocketTimeoutError extends WebSocketError {
  constructor(message: string, recoverable = true) {
    super(message, recoverable);
    this.name = 'WebSocketTimeoutError';
    Object.setPrototypeOf(this, WebSocketTimeoutError.prototype);
  }
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isClientEvent(event: WebSocketEvent): event is ClientToServerEvent {
  return [
    'agent_input',
    'voice_input',
    'subscribe_events',
    'function_confirmation',
    'ping',
  ].includes(event.event_type);
}

export function isServerEvent(event: WebSocketEvent): event is ServerToClientEvent {
  return !isClientEvent(event);
}

export function isErrorEvent(event: WebSocketEvent): event is ErrorEvent {
  return event.event_type === 'error';
}

export function isFunctionCallEvent(event: WebSocketEvent): event is FunctionCallEvent {
  return event.event_type === 'function_call';
}

export function isAgentResponseEvent(event: WebSocketEvent): event is AgentResponseEvent {
  return event.event_type === 'agent_response';
}

export function isConnectionStatusEvent(event: WebSocketEvent): event is ConnectionStatusEvent {
  return event.event_type === 'connection_status';
}

export function isPongEvent(event: WebSocketEvent): event is PongEvent {
  return event.event_type === 'pong';
}
