/**
 * React Hooks für KEI-Stream Integration
 * 
 * Diese Datei stellt React-Hooks für die einfache Integration von KEI-Stream
 * in React-Komponenten bereit.
 * 
 * @version 1.0.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { KEIStreamClient } from './client';
import { KEIStreamSSEClient } from './sse-client';
import { initializeTracing } from './tracing';
import {
  KEIStreamClientConfig,
  UseKEIStreamConfig,
  UseKEIStreamReturn,
  ConnectionState,
  KEIStreamClientStatus,
  FrameType,
  KEIStreamFrame,
  KEIStreamListener,
} from './types';

// =============================================================================
// MAIN KEI-STREAM HOOK
// =============================================================================

/**
 * Haupt-Hook für KEI-Stream Integration
 * 
 * Stellt vollständige KEI-Stream-Funktionalität für React-Komponenten bereit
 * mit automatischem Lifecycle-Management und State-Synchronisation.
 */
export function useKEIStream(config: UseKEIStreamConfig = {}): UseKEIStreamReturn {
  // Client-Instanz-Referenz
  const clientRef = useRef<KEIStreamClient | null>(null);
  const sseClientRef = useRef<KEIStreamSSEClient | null>(null);

  // State-Management
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.DISCONNECTED
  );
  const [status, setStatus] = useState<KEIStreamClientStatus>({
    connectionState: ConnectionState.DISCONNECTED,
    reconnectAttempts: 0,
    streams: new Map(),
    totalFramesSent: 0,
    totalFramesReceived: 0,
  });
  const [tracingInitialized, setTracingInitialized] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  // Status-Update-Intervall
  const statusUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Tracing-Initialisierung
  useEffect(() => {
    if (config.enableOTEL && !tracingInitialized) {
      initializeTracing({
        enabled: true,
        serviceName: 'kei-stream-frontend',
        samplingRate: 0.1,
        debug: config.debug || false,
      }).then((initialized) => {
        setTracingInitialized(initialized);
        if (initialized && config.debug) {
          console.debug('✅ OpenTelemetry für KEI-Stream initialisiert');
        }
      });
    }
  }, [config.enableOTEL, config.debug, tracingInitialized]);

  // Client initialisieren
  useEffect(() => {
    if (!config.url || !config.sessionId) {
      return; // Warten auf vollständige Konfiguration
    }

    const clientConfig: KEIStreamClientConfig = {
      url: config.url,
      sessionId: config.sessionId,
      apiToken: config.apiToken,
      tenantId: config.tenantId,
      scopes: config.scopes,
      ackCreditTarget: config.ackCreditTarget,
      ackEvery: config.ackEvery,
      reconnectInitialMs: config.reconnectInitialMs,
      reconnectMaxMs: config.reconnectMaxMs,
      enableOTEL: config.enableOTEL,
    };

    clientRef.current = new KEIStreamClient(clientConfig);

    // Status-Update-Timer starten
    statusUpdateIntervalRef.current = setInterval(() => {
      if (clientRef.current) {
        const currentStatus = clientRef.current.getStatus();
        setStatus(currentStatus);
        setConnectionState(currentStatus.connectionState);
        setLastError(currentStatus.lastError || null);
      }
    }, 1000);

    // Auto-Connect wenn konfiguriert
    if (config.autoConnect !== false) {
      clientRef.current.connect().catch((error) => {
        setLastError(error);
        if (config.debug) {
          console.error('KEI-Stream Auto-Connect Fehler:', error);
        }
      });
    }

    // Cleanup
    return () => {
      if (statusUpdateIntervalRef.current) {
        clearInterval(statusUpdateIntervalRef.current);
      }
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, [
    config.url,
    config.sessionId,
    config.apiToken,
    config.tenantId,
    config.autoConnect,
    config.debug,
  ]);

  // Verbindung herstellen
  const connect = useCallback(async () => {
    if (!clientRef.current) {
      throw new Error('KEI-Stream Client nicht initialisiert');
    }
    
    try {
      await clientRef.current.connect();
      setLastError(null);
    } catch (error) {
      setLastError(error as Error);
      throw error;
    }
  }, []);

  // Verbindung trennen
  const disconnect = useCallback(async () => {
    if (!clientRef.current) {
      return;
    }
    
    await clientRef.current.disconnect();
  }, []);

  // Frame senden
  const sendFrame = useCallback(
    (streamId: string, type: FrameType, payload?: Record<string, any>) => {
      if (!clientRef.current) {
        throw new Error('KEI-Stream Client nicht verbunden');
      }
      
      clientRef.current.send(streamId, type, payload);
    },
    []
  );

  // Listener registrieren
  const onFrame = useCallback(
    (streamId: string, listener: KEIStreamListener) => {
      if (!clientRef.current) {
        return () => {}; // Leere Cleanup-Funktion
      }
      
      return clientRef.current.on(streamId, listener);
    },
    []
  );

  // Globalen Listener registrieren
  const onAnyFrame = useCallback((listener: KEIStreamListener) => {
    if (!clientRef.current) {
      return () => {}; // Leere Cleanup-Funktion
    }
    
    return clientRef.current.onAny(listener);
  }, []);

  // Replay-Funktionalität
  const replay = useCallback(
    (streamId: string, sinceSeq: number) => {
      if (!clientRef.current) {
        return [];
      }
      
      return clientRef.current.replay(streamId, sinceSeq);
    },
    []
  );

  return {
    client: clientRef.current,
    connectionState,
    status,
    connect,
    disconnect,
    sendFrame,
    onFrame,
    onAnyFrame,
    replay,
    lastError,
  };
}

// =============================================================================
// SPECIALIZED HOOKS
// =============================================================================

/**
 * Hook für Stream-spezifische Funktionalität
 */
export function useKEIStreamConnection(
  streamId: string,
  config: UseKEIStreamConfig = {}
) {
  const keiStream = useKEIStream(config);
  const [frames, setFrames] = useState<KEIStreamFrame[]>([]);
  const [lastFrame, setLastFrame] = useState<KEIStreamFrame | null>(null);

  // Stream-spezifische Frames sammeln
  useEffect(() => {
    if (!keiStream.client) return;

    const cleanup = keiStream.onFrame(streamId, (frame) => {
      setLastFrame(frame);
      setFrames((prev) => [...prev.slice(-99), frame]); // Letzte 100 Frames behalten
    });

    return cleanup;
  }, [keiStream.client, keiStream.onFrame, streamId]);

  const sendToStream = useCallback(
    (type: FrameType, payload?: Record<string, any>) => {
      keiStream.sendFrame(streamId, type, payload);
    },
    [keiStream.sendFrame, streamId]
  );

  const replayStream = useCallback(
    (sinceSeq: number) => {
      return keiStream.replay(streamId, sinceSeq);
    },
    [keiStream.replay, streamId]
  );

  return {
    ...keiStream,
    streamId,
    frames,
    lastFrame,
    sendToStream,
    replayStream,
  };
}

/**
 * Hook für Frame-Typ-spezifische Listener
 */
export function useKEIStreamFrameType(
  streamId: string,
  frameType: FrameType,
  config: UseKEIStreamConfig = {}
) {
  const keiStream = useKEIStream(config);
  const [frames, setFrames] = useState<KEIStreamFrame[]>([]);
  const [lastFrame, setLastFrame] = useState<KEIStreamFrame | null>(null);

  useEffect(() => {
    if (!keiStream.client) return;

    const cleanup = keiStream.onFrame(streamId, (frame) => {
      if (frame.type === frameType) {
        setLastFrame(frame);
        setFrames((prev) => [...prev.slice(-49), frame]); // Letzte 50 Frames behalten
      }
    });

    return cleanup;
  }, [keiStream.client, keiStream.onFrame, streamId, frameType]);

  return {
    connectionState: keiStream.connectionState,
    frames,
    lastFrame,
    sendFrame: keiStream.sendFrame,
    lastError: keiStream.lastError,
  };
}

/**
 * Hook für Verbindungsstatistiken
 */
export function useKEIStreamStats(config: UseKEIStreamConfig = {}) {
  const keiStream = useKEIStream(config);
  const [stats, setStats] = useState({
    totalStreams: 0,
    activeStreams: 0,
    totalFramesSent: 0,
    totalFramesReceived: 0,
    averageLatency: 0,
    errorRate: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (keiStream.status) {
        const activeStreams = Array.from(keiStream.status.streams.values()).filter(
          (stream) => stream.isActive
        ).length;

        setStats({
          totalStreams: keiStream.status.streams.size,
          activeStreams,
          totalFramesSent: keiStream.status.totalFramesSent,
          totalFramesReceived: keiStream.status.totalFramesReceived,
          averageLatency: 0, // TODO: Latenz-Berechnung implementieren
          errorRate: 0, // TODO: Fehlerrate-Berechnung implementieren
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [keiStream.status]);

  return stats;
}

/**
 * Hook für automatische Reconnection-Logik
 */
export function useKEIStreamAutoReconnect(
  config: UseKEIStreamConfig & {
    maxReconnectAttempts?: number;
    onReconnectSuccess?: () => void;
    onReconnectFailed?: (error: Error) => void;
  } = {}
) {
  const keiStream = useKEIStream({ ...config, autoReconnect: false });
  const reconnectAttemptsRef = useRef(0);
  const maxAttempts = config.maxReconnectAttempts ?? 5;

  useEffect(() => {
    if (
      keiStream.connectionState === ConnectionState.DISCONNECTED &&
      reconnectAttemptsRef.current < maxAttempts &&
      config.autoReconnect !== false
    ) {
      const timeout = setTimeout(async () => {
        try {
          reconnectAttemptsRef.current++;
          await keiStream.connect();
          reconnectAttemptsRef.current = 0; // Reset bei erfolgreicher Verbindung
          config.onReconnectSuccess?.();
        } catch (error) {
          if (reconnectAttemptsRef.current >= maxAttempts) {
            config.onReconnectFailed?.(error as Error);
          }
        }
      }, Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000));

      return () => clearTimeout(timeout);
    }
  }, [
    keiStream.connectionState,
    keiStream.connect,
    maxAttempts,
    config.autoReconnect,
    config.onReconnectSuccess,
    config.onReconnectFailed,
  ]);

  // Reset bei manueller Verbindung
  useEffect(() => {
    if (keiStream.connectionState === ConnectionState.CONNECTED) {
      reconnectAttemptsRef.current = 0;
    }
  }, [keiStream.connectionState]);

  return {
    ...keiStream,
    reconnectAttempts: reconnectAttemptsRef.current,
    maxReconnectAttempts: maxAttempts,
  };
}

/**
 * Hook für Debug-Informationen
 */
export function useKEIStreamDebug(config: UseKEIStreamConfig = {}) {
  const keiStream = useKEIStream(config);
  const [debugInfo, setDebugInfo] = useState({
    lastFrameReceived: null as KEIStreamFrame | null,
    lastFrameSent: null as KEIStreamFrame | null,
    frameHistory: [] as KEIStreamFrame[],
    connectionHistory: [] as { state: ConnectionState; timestamp: Date }[],
  });

  // Globalen Listener für Debug-Informationen registrieren
  useEffect(() => {
    if (!keiStream.client) return;

    const cleanup = keiStream.onAnyFrame((frame) => {
      setDebugInfo((prev) => ({
        ...prev,
        lastFrameReceived: frame,
        frameHistory: [...prev.frameHistory.slice(-99), frame],
      }));
    });

    return cleanup;
  }, [keiStream.client, keiStream.onAnyFrame]);

  // Verbindungshistorie tracken
  useEffect(() => {
    setDebugInfo((prev) => ({
      ...prev,
      connectionHistory: [
        ...prev.connectionHistory.slice(-19),
        { state: keiStream.connectionState, timestamp: new Date() },
      ],
    }));
  }, [keiStream.connectionState]);

  return {
    ...keiStream,
    debugInfo,
  };
}

/**
 * Hook für KEI-Stream SSE-Client (Read-only Monitoring)
 */
export function useKEIStreamSSE(
  sessionId: string,
  streamId: string,
  baseUrl: string = 'http://localhost:8000/stream/sse'
) {
  const sseClientRef = useRef<KEIStreamSSEClient | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.DISCONNECTED
  );
  const [frames, setFrames] = useState<KEIStreamFrame[]>([]);
  const [lastFrame, setLastFrame] = useState<KEIStreamFrame | null>(null);
  const [status, setStatus] = useState<any>({});

  // SSE-Client initialisieren
  useEffect(() => {
    if (!sessionId || !streamId) return;

    sseClientRef.current = new KEIStreamSSEClient({
      baseUrl,
      sessionId,
      streamId,
      autoReconnect: true,
    });

    // Event-Handler registrieren
    const unsubscribeFrame = sseClientRef.current.on((frame) => {
      setLastFrame(frame);
      setFrames(prev => [...prev.slice(-99), frame]); // Letzte 100 Frames
    });

    // Verbindung herstellen
    sseClientRef.current.connect();

    // Status-Update-Timer
    const statusInterval = setInterval(() => {
      if (sseClientRef.current) {
        const currentStatus = sseClientRef.current.getStatus();
        setStatus(currentStatus);
        setConnectionState(currentStatus.connectionState);
      }
    }, 1000);

    // Cleanup
    return () => {
      unsubscribeFrame();
      clearInterval(statusInterval);
      sseClientRef.current?.disconnect();
    };
  }, [sessionId, streamId, baseUrl]);

  const connect = useCallback(async () => {
    if (sseClientRef.current) {
      await sseClientRef.current.connect();
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (sseClientRef.current) {
      await sseClientRef.current.disconnect();
    }
  }, []);

  return {
    client: sseClientRef.current,
    connectionState,
    frames,
    lastFrame,
    status,
    connect,
    disconnect,
    isConnected: connectionState === ConnectionState.CONNECTED,
  };
}

/**
 * Hook für Token-Bucket-Monitoring
 */
export function useKEIStreamTokenBuckets(config: UseKEIStreamConfig = {}) {
  const keiStream = useKEIStream(config);
  const [tokenBucketStats, setTokenBucketStats] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!keiStream.client) return;

    const interval = setInterval(() => {
      const status = keiStream.client!.getStatus();
      if (status.tokenBuckets) {
        setTokenBucketStats(status.tokenBuckets);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [keiStream.client]);

  return {
    ...keiStream,
    tokenBucketStats,
  };
}

/**
 * Hook für Compression-Monitoring
 */
export function useKEIStreamCompression(config: UseKEIStreamConfig = {}) {
  const keiStream = useKEIStream(config);
  const [compressionStats, setCompressionStats] = useState<any>({});

  useEffect(() => {
    if (!keiStream.client) return;

    const interval = setInterval(() => {
      const status = keiStream.client!.getStatus();
      if (status.compressionStats) {
        setCompressionStats(status.compressionStats);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [keiStream.client]);

  return {
    ...keiStream,
    compressionStats,
  };
}
