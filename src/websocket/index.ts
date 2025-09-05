// src/websocket/index.ts
/**
 * Keiko Personal Assistant WebSocket Client
 *
 * This module provides a comprehensive, type-safe WebSocket client system
 * for real-time communication with the Keiko Personal Assistant backend.
 *
 * Features:
 * - Full TypeScript type safety for all WebSocket events
 * - Automatic reconnection with exponential backoff
 * - React hooks for easy integration
 * - Health monitoring and connection diagnostics
 * - Message queuing for offline scenarios
 * - Event-based architecture with comprehensive error handling
 *
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Core event types
  EventType,
  WebSocketEvent,
  ClientToServerEvent,
  ServerToClientEvent,
  BaseWebSocketEvent,

  // Specific event types
  AgentInputEvent,
  VoiceInputEvent,
  FunctionConfirmationEvent,
  AgentResponseEvent,
  StatusUpdateEvent,
  ErrorEvent,
  FunctionCallEvent,
  FunctionResultEvent,
  ConnectionStatusEvent,
  PingEvent,
  PongEvent,

  // State and health types
  ExtendedWebSocketState,
  WebSocketConnectionHealth,
  QueuedMessage,

  // Configuration types
  ExtendedWebSocketClientConfig,
  ExtendedEventHandlerMap,
  ExtendedWebSocketManager,

  // Error types - Re-export for convenience
  WebSocketExtendedError,
  WebSocketConfigurationError,
  WebSocketConnectionError,
  WebSocketTimeoutError,
  WebSocketServerUnavailableError,
} from '../types/websocket-extended';

// =============================================================================
// CLIENT EXPORTS
// =============================================================================

/**
 * Low-level WebSocket client with full type safety
 * Use this for direct WebSocket management without React integration
 */
export { TypedWebSocketClient } from './typed-client';

// =============================================================================
// MANAGER EXPORTS
// =============================================================================

/**
 * High-level WebSocket manager with React integration
 * Recommended for most use cases in React applications
 */
export { WebSocketManager, useWebSocketStore, initializeWebSocket } from './manager';

// =============================================================================
// REACT HOOKS EXPORTS
// =============================================================================

/**
 * React hooks for easy WebSocket integration
 * These hooks provide reactive state management and automatic cleanup
 */
export {
  useWebSocketConnection,
  useAgentCommunication,
  useFunctionCalls,
  useConnectionHealth,
  useRecentEvents,
} from './manager';

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export {
  DEFAULT_CONFIG,
  mergeWithDefaults,
  validateExtendedConfig,
  createEvent,
  isClientEvent,
  isServerEvent,
  isErrorEvent,
  isFunctionCallEvent,
} from '../types/websocket-extended';

// =============================================================================
// CONFIGURATION PRESETS
// =============================================================================

// FIX: ServerToClientEvent Import hinzugefügt
import {
  DEFAULT_CONFIG,
  type ExtendedWebSocketClientConfig,
  type ServerToClientEvent,
} from '../types/websocket-extended';
import { initializeWebSocket, useWebSocketStore } from './manager';

/**
 * Development configuration preset
 */
export const DEVELOPMENT_CONFIG: Partial<ExtendedWebSocketClientConfig> = {
  ...DEFAULT_CONFIG,
  url: 'ws://localhost:8000/ws',
  debug: true,
  logLevel: 'debug',
  pingInterval: 15000,
};

/**
 * Production configuration preset
 */
export const PRODUCTION_CONFIG: Partial<ExtendedWebSocketClientConfig> = {
  ...DEFAULT_CONFIG,
  url: 'wss://api.keiko.ai/ws',
  debug: false,
  logLevel: 'error',
  pingInterval: 30000,
  maxReconnectAttempts: 10,
};

/**
 * Testing configuration preset
 */
export const TESTING_CONFIG: Partial<ExtendedWebSocketClientConfig> = {
  ...DEFAULT_CONFIG,
  url: 'ws://localhost:8001/ws',
  debug: true,
  logLevel: 'debug',
  autoReconnect: false,
  pingInterval: 5000,
};

// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================

function getEnvironmentConfig(): Partial<ExtendedWebSocketClientConfig> {
  if (typeof window === 'undefined') {
    return TESTING_CONFIG;
  }

  const hostname = window.location.hostname;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return DEVELOPMENT_CONFIG;
  }

  if (hostname.includes('staging') || hostname.includes('dev')) {
    return { ...DEVELOPMENT_CONFIG, url: 'wss://staging-api.keiko.ai/ws' };
  }

  return PRODUCTION_CONFIG;
}

// =============================================================================
// QUICK SETUP FUNCTION
// =============================================================================

/**
 * Quick setup function for common use cases
 * Automatically chooses configuration based on environment
 */
export async function quickSetup(
  options: {
    environment?: 'development' | 'production' | 'testing';
    customUrl?: string;
    debug?: boolean;
    autoConnect?: boolean;
  } = {},
): Promise<void> {
  // FIX: Entfernung der unused Variable 'environment'
  const { customUrl, debug, autoConnect = true } = options;

  const baseConfig = getEnvironmentConfig();
  const config: Partial<ExtendedWebSocketClientConfig> = {
    ...baseConfig,
    ...(customUrl && { url: customUrl }),
    ...(debug !== undefined && { debug, logLevel: debug ? 'debug' : 'error' }),
  };

  await initializeWebSocket(config);

  if (autoConnect) {
    const store = useWebSocketStore.getState();
    await store.connect();
  }
}

// =============================================================================
// DEBUGGING AND DIAGNOSTICS
// =============================================================================

/**
 * Diagnostic information for debugging
 */
export function getConnectionDiagnostics() {
  const store = useWebSocketStore.getState();

  return {
    isInitialized: store.isInitialized,
    connectionState: store.connectionState,
    connectionHealth: store.connectionHealth,
    recentEventsCount: store.recentEvents.length,
    pendingFunctionCallsCount: store.pendingFunctionCalls.length,
    errorHistoryCount: store.errorHistory.length,
    lastError: store.lastError?.message,
    clientExists: !!store.client,
  };
}

/**
 * Test WebSocket server availability
 */
export async function testWebSocketServer(url?: string): Promise<boolean> {
  const testUrl = url || DEFAULT_CONFIG.url;

  return new Promise((resolve) => {
    const ws = new WebSocket(testUrl);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
  });
}

/**
 * Connection health checker
 */
export async function checkConnectionHealth(): Promise<{
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
}> {
  const diagnostics = getConnectionDiagnostics();
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (!diagnostics.isInitialized) {
    issues.push('WebSocket client not initialized');
    recommendations.push('Call initializeWebSocket() first');
  }

  if (!diagnostics.connectionState.isConnected) {
    issues.push('Not connected to WebSocket server');
    recommendations.push('Check server availability and network connection');
  }

  if (!diagnostics.connectionHealth.isHealthy && diagnostics.connectionState.isConnected) {
    issues.push('Connection exists but is unhealthy');
    recommendations.push('Check network stability and server responsiveness');
  }

  if (diagnostics.connectionHealth.consecutiveFailures > 3) {
    issues.push(
      `${diagnostics.connectionHealth.consecutiveFailures} consecutive failures detected`,
    );
    recommendations.push('Consider reconnecting or checking server status');
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    recommendations,
  };
}

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Create test events for development and testing
 * FIX: ServerToClientEvent ist jetzt korrekt importiert
 */
export const createTestEvent = <T extends ServerToClientEvent>(
  eventType: T['event_type'],
  data: Omit<T, 'event_type' | 'timestamp'>,
): T => {
  return {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    ...data,
  } as T;
};
