// src/websocket/manager.ts
/**
 * WebSocket Manager mit React Integration
 *
 * High-level WebSocket-Manager mit React Hooks und State Management
 * für einfache Integration in React-Komponenten.
 *
 * Features:
 * - Zustand-Management mit Zustand
 * - React Hooks für verschiedene Use Cases
 * - Automatische Cleanup und Memory Management
 * - Integrierte Fehlerbehandlung
 * - Event-History und Recent Messages
 *
 * @version 2.1.0
 */

import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import { TypedWebSocketClient } from './typed-client';
import { defaultCacheManager } from '@/services/cache/cacheManager';
import { flush } from '@/services/offline/queue'

import {
  type AgentResponseEvent,
  type ErrorEvent,
  type EventType,
  type ExtendedWebSocketClientConfig,
  type ExtendedWebSocketState,
  type FunctionCallEvent,
  type FunctionResultEvent,
  mergeWithDefaults,
  type ServerToClientEvent,
  type StatusUpdateEvent,
  type WebSocketConnectionHealth,
} from '../types/websocket-extended';

// =============================================================================
// CACHE INVALIDATION HANDLER
// =============================================================================

/**
 * Behandelt Cache-Invalidierung basierend auf Event-Typ atomisch.
 *
 * Event-Mapping-Regeln:
 * - `agent_status_changed` → invalidiert `['agents', 'user:{id}']` wenn user_id vorhanden
 * - `target_status_changed` → invalidiert `['webhooks']`
 * - `webhook_delivered` → invalidiert `['webhooks']`
 */
async function handleCacheInvalidation(event: ServerToClientEvent): Promise<void> {
  try {
    const eventType = (event as any).event_type;

    switch (eventType) {
      case 'agent_status_changed':
        // Invalidiere agents und user-spezifische Caches wenn user_id vorhanden
        const userId = (event as any).user_id;
        const invalidationPromises: Promise<void>[] = [
          defaultCacheManager.invalidateByTag('agents')
        ];

        if (userId) {
          invalidationPromises.push(
            defaultCacheManager.invalidateByTag(`user:${userId}`)
          );
        }

        // Atomische Ausführung aller Invalidierungen
        await Promise.all(invalidationPromises);
        break;

      case 'target_status_changed':
      case 'webhook_delivered':
        await defaultCacheManager.invalidateByTag('webhooks');
        break;

      default:
        // Keine Cache-Invalidierung für andere Events
        break;
    }
  } catch (error) {
    // Fehler bei Cache-Invalidierung nicht eskalieren
    console.warn('[WebSocket] Cache invalidation failed:', error);
  }
}

// =============================================================================
// STORE INTERFACES
// =============================================================================

interface RecentEvent {
  id: string;
  event: ServerToClientEvent;
  timestamp: Date;
  acknowledged: boolean;
}

interface PendingFunctionCall {
  id: string;
  event: FunctionCallEvent;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'rejected' | 'timeout';
}

interface WebSocketStore {
  // Client instance
  client: TypedWebSocketClient | null;

  // Connection state
  connectionState: ExtendedWebSocketState;
  connectionHealth: WebSocketConnectionHealth;
  isInitialized: boolean;

  // Event history
  recentEvents: RecentEvent[];
  maxRecentEvents: number;

  // Agent communication
  currentAgentResponse: string;
  isAgentResponding: boolean;
  agentStatus: 'idle' | 'thinking' | 'processing' | 'error';

  // Function calls
  pendingFunctionCalls: PendingFunctionCall[];
  functionCallHistory: FunctionResultEvent[];

  // Error state
  lastError: Error | null;
  errorHistory: ErrorEvent[];

  // Actions
  initialize: (config?: Partial<ExtendedWebSocketClientConfig>) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  destroy: () => void;

  // Message actions
  sendMessage: (message: string, metadata?: Record<string, any>) => void;
  sendVoiceInput: (text: string, metadata?: Record<string, any>) => void;
  confirmFunction: (functionCallId: string, confirmed: boolean, reason?: string) => void;

  // Event management
  acknowledgeEvent: (eventId: string) => void;
  clearRecentEvents: () => void;
  clearErrors: () => void;

  // Helper method to add events to recent events
  addRecentEvent: (event: ServerToClientEvent) => void;
}

// =============================================================================
// ZUSTAND STORE
// =============================================================================

export const useWebSocketStore = create<WebSocketStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // Initial state
      client: null,
      connectionState: {
        status: 'disconnected',
        isConnected: false,
        lastConnected: null,
        lastDisconnected: null,
        reconnectAttempts: 0,
        maxReconnectAttempts: 10,
        error: null,
        subscribedEvents: [],
      },
      connectionHealth: {
        isHealthy: false,
        latency: null,
        lastPing: null,
        lastPong: null,
        consecutiveFailures: 0,
        uptime: 0,
        totalReconnects: 0,
        messagesReceived: 0,
        messagesSent: 0,
      },
      isInitialized: false,
      recentEvents: [],
      maxRecentEvents: 50,
      currentAgentResponse: '',
      isAgentResponding: false,
      agentStatus: 'idle',
      pendingFunctionCalls: [],
      functionCallHistory: [],
      lastError: null,
      errorHistory: [],

      // Actions
      initialize: async (config) => {
        const state = get();
        if (state.isInitialized) {
          console.warn('WebSocket already initialized');
          return;
        }

        const finalConfig = mergeWithDefaults(config || {});
        const client = new TypedWebSocketClient(finalConfig);

        // Setup event handlers
        client.on('connected', () => {
          set((draft) => {
            draft.connectionState = client.getState();
            draft.connectionHealth = client.getHealth();
            draft.lastError = null;
          });
          // Bei Reconnect: Offline-Queue flushen
          flush(async (item) => {
            try {
              const resp = await fetch(item.url, { method: item.method, headers: item.headers, body: item.body instanceof FormData ? item.body : JSON.stringify(item.body) })
              return resp.ok
            } catch (_) { return false }
          }).catch(() => { })
        });

        // FIX: Entfernt unused parameter 'reason'
        client.on('disconnected', () => {
          set((draft) => {
            draft.connectionState = client.getState();
            draft.connectionHealth = client.getHealth();
          });
        });

        // FIX: Entfernt unused parameter 'attempt'
        client.on('reconnecting', () => {
          set((draft) => {
            draft.connectionState = client.getState();
            draft.connectionHealth = client.getHealth();
          });
        });

        client.on('agent_response', (event: AgentResponseEvent) => {
          set((draft) => {
            if (event.is_final) {
              // FIX: 'content' → 'message'
              draft.currentAgentResponse = event.message;
              draft.isAgentResponding = false;
              draft.agentStatus = 'idle';
            } else {
              // FIX: 'content' → 'message'
              draft.currentAgentResponse += event.message;
              draft.isAgentResponding = true;
              draft.agentStatus = 'processing';
            }
          });
          // FIX: get() anstatt state
          get().addRecentEvent(event);
        });

        client.on('status_update', (event: StatusUpdateEvent) => {
          set((draft) => {
            draft.agentStatus =
              event.status === 'processing'
                ? 'processing'
                : event.status === 'thinking'
                  ? 'thinking'
                  : 'idle';
          });
          // FIX: get() anstatt state
          get().addRecentEvent(event);
        });

        client.on('function_call', (event: FunctionCallEvent) => {
          set((draft) => {
            const pendingCall: PendingFunctionCall = {
              id: event.function_call_id,
              event,
              timestamp: new Date(),
              status: 'pending',
            };
            draft.pendingFunctionCalls.push(pendingCall);
          });
          // FIX: get() anstatt state
          get().addRecentEvent(event);
        });

        client.on('function_result', (event: FunctionResultEvent) => {
          set((draft) => {
            // Remove from pending
            draft.pendingFunctionCalls = draft.pendingFunctionCalls.filter(
              (call) => call.id !== event.function_call_id,
            );

            // Add to history
            draft.functionCallHistory.push(event);

            // Keep only last 20 function results
            if (draft.functionCallHistory.length > 20) {
              draft.functionCallHistory = draft.functionCallHistory.slice(-20);
            }
          });
          // FIX: get() anstatt state
          get().addRecentEvent(event);

          // Cache-Invalidierung für relevante Events (atomisch)
          handleCacheInvalidation(event).catch(() => { })
        });

        // FIX: Error Event Handler Typ-Problem - Parameter ist Error, nicht ErrorEvent
        client.on('error', (error: Error) => {
          const errorEvent: ErrorEvent = {
            event_type: 'error',
            timestamp: new Date().toISOString(),
            // FIX: 'event_id' entfernt - existiert nicht in ErrorEvent
            error_code: 'CLIENT_ERROR',
            message: error.message,
            recoverable: true,
          };

          set((draft) => {
            draft.errorHistory.push(errorEvent);
            if (draft.errorHistory.length > 10) {
              draft.errorHistory = draft.errorHistory.slice(-10);
            }
          });
          // FIX: get() anstatt state
          get().addRecentEvent(errorEvent);
        });

        // FIX: Entfernt unused parameter 'event'
        client.on('message', () => {
          set((draft) => {
            draft.connectionHealth = client.getHealth();
          });
        });

        set((draft) => {
          draft.client = client;
          draft.isInitialized = true;
        });
      },

      connect: async () => {
        const { client } = get();
        if (!client) {
          throw new Error('Client not initialized. Call initialize() first.');
        }
        await client.connect();
      },

      disconnect: async () => {
        const { client } = get();
        if (client) {
          await client.disconnect();
        }
      },

      destroy: () => {
        const { client } = get();
        if (client) {
          client.destroy();
        }
        set((draft) => {
          draft.client = null;
          draft.isInitialized = false;
        });
      },

      sendMessage: (message, metadata) => {
        const { client } = get();
        if (client && client.isConnected()) {
          // FIX: 'sendMessage' → 'sendAgentInput'
          client.sendAgentInput(message, metadata);
        }
      },

      sendVoiceInput: (text, metadata) => {
        const { client } = get();
        if (client && client.isConnected()) {
          client.sendVoiceInput(text, metadata);
        }
      },

      confirmFunction: (functionCallId, confirmed, reason) => {
        const { client } = get();
        if (client && client.isConnected()) {
          client.confirmFunction(functionCallId, confirmed, reason);
        }

        set((draft) => {
          const call = draft.pendingFunctionCalls.find((c) => c.id === functionCallId);
          if (call) {
            call.status = confirmed ? 'confirmed' : 'rejected';
          }
        });
      },

      acknowledgeEvent: (eventId) => {
        set((draft) => {
          const event = draft.recentEvents.find((e) => e.id === eventId);
          if (event) {
            event.acknowledged = true;
          }
        });
      },

      clearRecentEvents: () => {
        set((draft) => {
          draft.recentEvents = [];
        });
      },

      clearErrors: () => {
        set((draft) => {
          draft.lastError = null;
          draft.errorHistory = [];
        });
      },

      // Helper method to add events to recent events
      addRecentEvent: (event: ServerToClientEvent) => {
        set((draft) => {
          const recentEvent: RecentEvent = {
            id: `${event.event_type}_${Date.now()}_${Math.random()}`,
            event,
            timestamp: new Date(),
            acknowledged: false,
          };

          draft.recentEvents.unshift(recentEvent);

          if (draft.recentEvents.length > draft.maxRecentEvents) {
            draft.recentEvents = draft.recentEvents.slice(0, draft.maxRecentEvents);
          }
        });
      },
    })),
  ),
);

// =============================================================================
// INITIALIZATION HELPER
// =============================================================================

let isGloballyInitialized = false;

export const initializeWebSocket = async (
  config?: Partial<ExtendedWebSocketClientConfig>,
): Promise<void> => {
  if (isGloballyInitialized) {
    console.warn('WebSocket already globally initialized');
    return;
  }

  const store = useWebSocketStore.getState();
  await store.initialize(config);
  isGloballyInitialized = true;
};

// =============================================================================
// REACT HOOKS
// =============================================================================

/**
 * Main WebSocket connection hook
 */
export const useWebSocketConnection = () => {
  const {
    connectionState,
    connectionHealth,
    isInitialized,
    lastError,
    connect,
    disconnect,
    destroy,
    clearErrors,
  } = useWebSocketStore();

  const connectWithRetry = useCallback(
    async (maxRetries = 3) => {
      let retries = 0;
      while (retries < maxRetries) {
        try {
          await connect();
          return;
        } catch (error) {
          retries++;
          if (retries >= maxRetries) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
        }
      }
    },
    [connect],
  );

  const isHealthy = useMemo(() => {
    return connectionState.isConnected && connectionHealth.isHealthy;
  }, [connectionState.isConnected, connectionHealth.isHealthy]);

  return {
    isInitialized,
    isConnected: connectionState.isConnected,
    isHealthy,
    connectionState,
    connectionHealth,
    lastError,
    connect,
    connectWithRetry,
    disconnect,
    destroy,
    clearErrors,
  };
};

/**
 * Agent communication hook
 */
export const useAgentCommunication = () => {
  const { currentAgentResponse, isAgentResponding, agentStatus, sendMessage, sendVoiceInput } =
    useWebSocketStore();

  const sendMessageWithFeedback = useCallback(
    (message: string, metadata?: Record<string, any>) => {
      sendMessage(message, metadata);
    },
    [sendMessage],
  );

  return {
    currentResponse: currentAgentResponse,
    isResponding: isAgentResponding,
    status: agentStatus,
    sendMessage: sendMessageWithFeedback,
    sendVoiceInput,
  };
};

/**
 * Function calls management hook
 */
export const useFunctionCalls = () => {
  const { pendingFunctionCalls, functionCallHistory, confirmFunction } = useWebSocketStore();

  const confirmPendingFunction = useCallback(
    (functionCallId: string, confirmed: boolean, reason?: string) => {
      confirmFunction(functionCallId, confirmed, reason);
    },
    [confirmFunction],
  );

  const pendingCalls = useMemo(
    () => pendingFunctionCalls.filter((call) => call.status === 'pending'),
    [pendingFunctionCalls],
  );

  return {
    pendingCalls,
    allPendingCalls: pendingFunctionCalls,
    callHistory: functionCallHistory,
    confirmFunction: confirmPendingFunction,
    hasPendingCalls: pendingCalls.length > 0,
  };
};

/**
 * Connection health monitoring hook
 */
export const useConnectionHealth = () => {
  const { connectionHealth, connectionState } = useWebSocketStore();

  const healthInfo = useMemo(
    () => ({
      ...connectionHealth,
      status: connectionState.status,
      reconnectAttempts: connectionState.reconnectAttempts,
    }),
    [connectionHealth, connectionState],
  );

  return healthInfo;
};

/**
 * Recent events hook with filtering
 */
export const useRecentEvents = (
  eventTypes?: EventType[],
  limit?: number,
  onlyUnacknowledged = false,
) => {
  const { recentEvents, acknowledgeEvent, clearRecentEvents } = useWebSocketStore();

  const filteredEvents = useMemo(() => {
    let filtered = recentEvents;

    if (eventTypes) {
      filtered = filtered.filter((event) => eventTypes.includes(event.event.event_type));
    }

    if (onlyUnacknowledged) {
      filtered = filtered.filter((event) => !event.acknowledged);
    }

    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }, [recentEvents, eventTypes, limit, onlyUnacknowledged]);

  const acknowledgeAll = useCallback(() => {
    filteredEvents.forEach((event) => acknowledgeEvent(event.id));
  }, [filteredEvents, acknowledgeEvent]);

  return {
    events: filteredEvents,
    acknowledgeEvent,
    acknowledgeAll,
    clearEvents: clearRecentEvents,
    totalCount: recentEvents.length,
    unacknowledgedCount: recentEvents.filter((e) => !e.acknowledged).length,
  };
};

// =============================================================================
// MANAGER CLASS (für non-React contexts)
// =============================================================================

/**
 * Standalone WebSocket Manager für non-React contexts
 */
export class WebSocketManager {
  private store = useWebSocketStore.getState();
  private unsubscribe: (() => void) | null = null;

  constructor(config?: Partial<ExtendedWebSocketClientConfig>) {
    this.initialize(config);
  }

  async initialize(config?: Partial<ExtendedWebSocketClientConfig>): Promise<void> {
    await this.store.initialize(config);

    // Subscribe to store changes
    this.unsubscribe = useWebSocketStore.subscribe(
      (state) => state,
      () => {
        // FIX: Entfernt unused parameter 'state'
        // Handle state changes if needed
      },
    );
  }

  async connect(): Promise<void> {
    return this.store.connect();
  }

  async disconnect(): Promise<void> {
    return this.store.disconnect();
  }

  sendMessage(message: string, metadata?: Record<string, any>): void {
    this.store.sendMessage(message, metadata);
  }

  getState() {
    return {
      connectionState: this.store.connectionState,
      connectionHealth: this.store.connectionHealth,
      isConnected: this.store.connectionState.isConnected,
      recentEvents: this.store.recentEvents,
      pendingFunctionCalls: this.store.pendingFunctionCalls,
    };
  }

  onMessage(callback: (event: ServerToClientEvent) => void): void {
    if (this.store.client) {
      this.store.client.on('message', callback);
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    this.store.destroy();
  }
}
