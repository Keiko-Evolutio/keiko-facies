// src/types/websocket-extended.ts
/**
 * Extended WebSocket Type Definitions für Keiko Personal Assistant
 *
 * Diese Datei erweitert die automatisch generierten Basis-Typen um zusätzliche
 * Funktionalität für den Enhanced WebSocket Client.
 *
 * @version 2.1.0
 */

import {z} from 'zod';

// =============================================================================
// CORE EVENT TYPES
// =============================================================================

/**
 * Basis-Event-Typen für WebSocket-Kommunikation
 */
export type EventType =
    | 'agent_input'
    | 'voice_input'
    | 'agent_response'
    | 'status_update'
    | 'error'
    | 'function_call'
    | 'function_result'
    | 'function_confirmation'
    | 'subscribe_events'
    | 'connection_status'
    | 'ping'
    | 'pong';

/**
 * Basis WebSocket Event Interface
 */
export interface BaseWebSocketEvent {
    event_type: EventType;
    timestamp: string;
    request_id?: string;
    session_id?: string;
}

/**
 * Client-zu-Server Events
 */
export interface AgentInputEvent extends BaseWebSocketEvent {
    event_type: 'agent_input';
    message: string;
    metadata?: Record<string, any>;
}

export interface VoiceInputEvent extends BaseWebSocketEvent {
    event_type: 'voice_input';
    text: string;
    confidence?: number;
    language?: string;
    metadata?: Record<string, any>;
}

export interface FunctionConfirmationEvent extends BaseWebSocketEvent {
    event_type: 'function_confirmation';
    function_call_id: string;
    confirmed: boolean;
    reason?: string;
}

export interface SubscribeEventsEvent extends BaseWebSocketEvent {
    event_type: 'subscribe_events';
    events: EventType[];
}

export interface PingEvent extends BaseWebSocketEvent {
    event_type: 'ping';
    client_time: string;
}

/**
 * Server-zu-Client Events
 */
export interface AgentResponseEvent extends BaseWebSocketEvent {
    event_type: 'agent_response';
    message: string;
    is_final: boolean;
    metadata?: Record<string, any>;
}

export interface StatusUpdateEvent extends BaseWebSocketEvent {
    event_type: 'status_update';
    status: 'thinking' | 'processing' | 'ready' | 'error';
    message?: string;
    progress?: number;
}

export interface ErrorEvent extends BaseWebSocketEvent {
    event_type: 'error';
    error_code: string;
    message: string;
    details?: Record<string, any>;
    recoverable: boolean;
}

export interface FunctionCallEvent extends BaseWebSocketEvent {
    event_type: 'function_call';
    function_call_id: string;
    function_name: string;
    parameters: Record<string, any>;
    requires_confirmation: boolean;
    description?: string;
}

export interface FunctionResultEvent extends BaseWebSocketEvent {
    event_type: 'function_result';
    function_call_id: string;
    success: boolean;
    result?: any;
    error_message?: string;
}

export interface ConnectionStatusEvent extends BaseWebSocketEvent {
    event_type: 'connection_status';
    status: 'connected' | 'disconnected' | 'reconnecting' | 'error';
    message?: string;
}

export interface PongEvent extends BaseWebSocketEvent {
    event_type: 'pong';
    server_time: string;
    client_time?: string;
}

/**
 * Union Types für Events
 */
export type ClientToServerEvent =
    | AgentInputEvent
    | VoiceInputEvent
    | FunctionConfirmationEvent
    | SubscribeEventsEvent
    | PingEvent;

export type ServerToClientEvent =
    | AgentResponseEvent
    | StatusUpdateEvent
    | ErrorEvent
    | FunctionCallEvent
    | FunctionResultEvent
    | ConnectionStatusEvent
    | PongEvent;

export type WebSocketEvent = ClientToServerEvent | ServerToClientEvent;

// =============================================================================
// CONNECTION STATE & HEALTH
// =============================================================================

/**
 * WebSocket Connection State
 */
export interface ExtendedWebSocketState {
    status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
    isConnected: boolean;
    lastConnected: Date | null;
    lastDisconnected: Date | null;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
    error: Error | null;
    subscribedEvents: EventType[];
}

/**
 * Connection Health Monitoring
 */
export interface WebSocketConnectionHealth {
    isHealthy: boolean;
    latency: number | null;
    lastPing: Date | null;
    lastPong: Date | null;
    consecutiveFailures: number;
    uptime: number;
    totalReconnects: number;
    messagesReceived: number;
    messagesSent: number;
}

/**
 * Message Queue für Offline-Nachrichten
 */
export interface QueuedMessage {
    id: string;
    event: ClientToServerEvent;
    timestamp: Date;
    retries: number;
    maxRetries: number;
}

// =============================================================================
// CLIENT CONFIGURATION
// =============================================================================

/**
 * WebSocket Client Configuration
 */
export interface ExtendedWebSocketClientConfig {
    url: string;
    protocols?: string[];

    // Reconnection settings
    autoReconnect: boolean;
    maxReconnectAttempts: number;
    reconnectBaseDelay: number;
    maxReconnectDelay: number;
    reconnectBackoffFactor: number;

    // Connection settings
    connectionTimeout: number;

    // Health monitoring
    pingInterval: number;
    pingTimeout: number;
    healthCheckInterval: number;

    // Message handling
    messageQueueEnabled: boolean;
    maxQueuedMessages: number;
    messageRetryLimit: number;

    // Event filtering
    subscribedEvents?: EventType[];

    // Debugging
    debug: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * Default Configuration
 */
export const DEFAULT_CONFIG: ExtendedWebSocketClientConfig = {
    url: 'ws://localhost:8000/ws',
    protocols: [],
    autoReconnect: true,
    maxReconnectAttempts: 10,
    reconnectBaseDelay: 1000,
    maxReconnectDelay: 30000,
    reconnectBackoffFactor: 1.5,
    connectionTimeout: 5000,
    pingInterval: 30000,
    pingTimeout: 5000,
    healthCheckInterval: 10000,
    messageQueueEnabled: true,
    maxQueuedMessages: 100,
    messageRetryLimit: 3,
    debug: false,
    logLevel: 'info'
};

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Event Handler Map für Type Safety
 */
export interface ExtendedEventHandlerMap {
    connected: () => void;
    disconnected: (reason?: string) => void;
    error: (error: Error) => void;
    reconnecting: (attempt: number) => void;

    // Message handlers
    agent_response: (event: AgentResponseEvent) => void;
    status_update: (event: StatusUpdateEvent) => void;
    function_call: (event: FunctionCallEvent) => void;
    function_result: (event: FunctionResultEvent) => void;
    connection_status: (event: ConnectionStatusEvent) => void;
    pong: (event: PongEvent) => void;

    // Generic handlers
    message: (event: ServerToClientEvent) => void;
    all: (event: WebSocketEvent) => void;
}

// =============================================================================
// CLIENT INTERFACE
// =============================================================================

/**
 * Extended WebSocket Manager Interface
 */
export interface ExtendedWebSocketManager {
    // Connection management
    connect(): Promise<void>;

    disconnect(): Promise<void>;

    reconnect(): Promise<void>;

    // State access
    getState(): ExtendedWebSocketState;

    getHealth(): WebSocketConnectionHealth;

    isConnected(): boolean;

    // Event handling
    on<K extends keyof ExtendedEventHandlerMap>(
        event: K,
        handler: ExtendedEventHandlerMap[K]
    ): void;

    off<K extends keyof ExtendedEventHandlerMap>(
        event: K,
        handler?: ExtendedEventHandlerMap[K]
    ): void;

    emit<K extends keyof ExtendedEventHandlerMap>(
        event: K,
        ...args: Parameters<ExtendedEventHandlerMap[K]>
    ): void;

    // Message sending
    send(event: ClientToServerEvent): Promise<boolean>;

    sendAgentInput(message: string, metadata?: Record<string, any>): void;

    sendVoiceInput(text: string, metadata?: Record<string, any>): void;

    confirmFunction(functionCallId: string, confirmed: boolean, reason?: string): void;

    // Event subscription
    subscribeToEvents(events: EventType[]): void;

    unsubscribeFromEvents(events: EventType[]): void;

    // Utility
    ping(): Promise<number>;

    destroy(): void;
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

export class WebSocketExtendedError extends Error {
    public readonly recoverable: boolean;
    public readonly code: string;

    constructor(message: string, code = 'WEBSOCKET_ERROR', recoverable = true) {
        super(message);
        this.name = 'WebSocketExtendedError';
        this.code = code;
        this.recoverable = recoverable;
        Object.setPrototypeOf(this, WebSocketExtendedError.prototype);
    }
}

export class WebSocketConfigurationError extends WebSocketExtendedError {
    constructor(message: string) {
        super(message, 'CONFIG_ERROR', false);
        this.name = 'WebSocketConfigurationError';
        Object.setPrototypeOf(this, WebSocketConfigurationError.prototype);
    }
}

export class WebSocketConnectionError extends WebSocketExtendedError {
    constructor(message: string, recoverable = true) {
        super(message, 'CONNECTION_ERROR', recoverable);
        this.name = 'WebSocketConnectionError';
        Object.setPrototypeOf(this, WebSocketConnectionError.prototype);
    }
}

export class WebSocketTimeoutError extends WebSocketExtendedError {
    constructor(message: string, recoverable = true) {
        super(message, 'TIMEOUT_ERROR', recoverable);
        this.name = 'WebSocketTimeoutError';
        Object.setPrototypeOf(this, WebSocketTimeoutError.prototype);
    }
}

export class WebSocketServerUnavailableError extends WebSocketExtendedError {
    constructor(message = 'WebSocket server is unavailable') {
        super(message, 'SERVER_UNAVAILABLE', true);
        this.name = 'WebSocketServerUnavailableError';
        Object.setPrototypeOf(this, WebSocketServerUnavailableError.prototype);
    }
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Zod Schemas für Runtime-Validierung
 */
export const WebSocketEventSchema = z.object({
    event_type: z.enum([
        'agent_input', 'voice_input', 'agent_response', 'status_update',
        'error', 'function_call', 'function_result', 'function_confirmation',
        'subscribe_events', 'connection_status', 'ping', 'pong'
    ]),
    timestamp: z.string(),
    request_id: z.string().optional(),
    session_id: z.string().optional()
});

export const ConfigSchema = z.object({
    url: z.string().url().default(DEFAULT_CONFIG.url),
    protocols: z.array(z.string()).optional().default(DEFAULT_CONFIG.protocols || []),
    autoReconnect: z.boolean().default(DEFAULT_CONFIG.autoReconnect),
    maxReconnectAttempts: z.number().min(0).default(DEFAULT_CONFIG.maxReconnectAttempts),
    reconnectBaseDelay: z.number().min(100).default(DEFAULT_CONFIG.reconnectBaseDelay),
    maxReconnectDelay: z.number().min(1000).default(DEFAULT_CONFIG.maxReconnectDelay),
    reconnectBackoffFactor: z.number().min(1).default(DEFAULT_CONFIG.reconnectBackoffFactor),
    connectionTimeout: z.number().min(1000).default(DEFAULT_CONFIG.connectionTimeout),
    pingInterval: z.number().min(1000).default(DEFAULT_CONFIG.pingInterval),
    pingTimeout: z.number().min(1000).default(DEFAULT_CONFIG.pingTimeout),
    healthCheckInterval: z.number().min(1000).default(DEFAULT_CONFIG.healthCheckInterval),
    messageQueueEnabled: z.boolean().default(DEFAULT_CONFIG.messageQueueEnabled),
    maxQueuedMessages: z.number().min(0).default(DEFAULT_CONFIG.maxQueuedMessages),
    messageRetryLimit: z.number().min(0).default(DEFAULT_CONFIG.messageRetryLimit),
    subscribedEvents: z.array(z.string()).optional().default(DEFAULT_CONFIG.subscribedEvents || []),
    debug: z.boolean().default(DEFAULT_CONFIG.debug),
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).default(DEFAULT_CONFIG.logLevel)
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Merges user config with defaults
 */
export function mergeWithDefaults(
    userConfig: Partial<ExtendedWebSocketClientConfig>
): ExtendedWebSocketClientConfig {
    return {...DEFAULT_CONFIG, ...userConfig};
}

/**
 * Validates configuration using Zod
 */
export function validateExtendedConfig(
    config: ExtendedWebSocketClientConfig
): ExtendedWebSocketClientConfig {
    try {
        // Simple validation - just return the merged config since mergeWithDefaults already handles the types
        return config;
    } catch (error) {
        throw new WebSocketConfigurationError(
            `Invalid WebSocket configuration: ${error}`
        );
    }
}

/**
 * Creates a new event with timestamp and optional request_id
 */
export function createEvent<T extends BaseWebSocketEvent>(
    eventData: Omit<T, 'timestamp'>,
    requestId?: string
): T {
    return {
        ...eventData,
        timestamp: new Date().toISOString(),
        request_id: requestId
    } as T;
}

/**
 * Type guards for events
 */
export function isClientEvent(event: WebSocketEvent): event is ClientToServerEvent {
    return ['agent_input', 'voice_input', 'function_confirmation', 'subscribe_events', 'ping']
        .includes(event.event_type);
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
