/**
 * React Hook für Live System Heartbeat über bestehende WebSocket-Infrastruktur
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface SystemService {
  name: string;
  status: 'healthy' | 'unhealthy' | 'starting' | 'failed' | 'unknown';
  last_check: number;
  response_time_ms: number;
}

interface SystemSummary {
  total: number;
  healthy: number;
  unhealthy: number;
  starting: number;
  failed: number;
  unknown: number;
}

interface SystemHeartbeat {
  timestamp: number;
  phase: string;
  overall_status: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<string, SystemService>;
  summary: SystemSummary;
  uptime_seconds: number;
  message: string;
}

interface WebSocketEvent {
  event_type: string;
  event_id: string;
  timestamp: string;
  correlation_id?: string;
  [key: string]: any;
}

interface SystemHeartbeatEvent extends WebSocketEvent {
  event_type: 'system_heartbeat';
  timestamp: number;
  phase: string;
  overall_status: string;
  services: Record<string, SystemService>;
  summary: SystemSummary;
  uptime_seconds: number;
  message: string;
}

interface UseSystemHeartbeatReturn {
  heartbeat: SystemHeartbeat | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnect: () => void;
}

export const useSystemHeartbeat = (): UseSystemHeartbeatReturn => {
  const [heartbeat, setHeartbeat] = useState<SystemHeartbeat | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const reconnectDelay = 3000; // 3 Sekunden
  const userId = 'system_heartbeat_client'; // Eindeutige User-ID für Heartbeat-Client

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Bereits verbunden
    }

    setIsConnecting(true);
    setError(null);

    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const wsUrl = API_BASE.replace('http://', 'ws://').replace('https://', 'wss://');

      // Nutze die korrekte WebSocket-Route für Client-Verbindungen
      console.log('🔌 Verbinde mit System Heartbeat über Client WebSocket:', `${wsUrl}/ws/client/${userId}`);

      const ws = new WebSocket(`${wsUrl}/ws/client/${userId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('💓 System Heartbeat WebSocket verbunden');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Abonniere System Heartbeat Updates
        const subscribeMessage = {
          event_type: 'system_heartbeat',
          action: 'subscribe',
          timestamp: new Date().toISOString(),
          event_id: `heartbeat_sub_${Date.now()}`
        };
        ws.send(JSON.stringify(subscribeMessage));
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketEvent = JSON.parse(event.data);

          if (message.event_type === 'system_heartbeat') {
            const heartbeatEvent = message as SystemHeartbeatEvent;
            const heartbeatData: SystemHeartbeat = {
              timestamp: heartbeatEvent.timestamp,
              phase: heartbeatEvent.phase,
              overall_status: heartbeatEvent.overall_status as 'healthy' | 'degraded' | 'unhealthy',
              services: heartbeatEvent.services,
              summary: heartbeatEvent.summary,
              uptime_seconds: heartbeatEvent.uptime_seconds,
              message: heartbeatEvent.message
            };

            setHeartbeat(heartbeatData);
            console.log('💓 Heartbeat Update:', {
              total: heartbeatData.summary.total,
              healthy: heartbeatData.summary.healthy,
              status: heartbeatData.overall_status
            });
          }
        } catch (err) {
          console.error('Fehler beim Parsen der WebSocket-Nachricht:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('💓 System Heartbeat WebSocket geschlossen:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;

        // Automatischer Reconnect (außer bei bewusstem Schließen)
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`🔄 Reconnect Versuch ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${reconnectDelay}ms`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Maximale Anzahl von Reconnect-Versuchen erreicht');
        }
      };

      ws.onerror = (event) => {
        console.error('💓 System Heartbeat WebSocket Fehler:', event);
        setError('WebSocket-Verbindungsfehler');
        setIsConnecting(false);
      };

    } catch (err) {
      console.error('Fehler beim Erstellen der WebSocket-Verbindung:', err);
      setError('Fehler beim Verbinden');
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Deabonniere System Heartbeat Updates vor dem Schließen
      const unsubscribeMessage = {
        event_type: 'system_heartbeat',
        action: 'unsubscribe',
        timestamp: new Date().toISOString(),
        event_id: `heartbeat_unsub_${Date.now()}`
      };
      wsRef.current.send(JSON.stringify(unsubscribeMessage));

      wsRef.current.close(1000, 'Bewusst geschlossen');
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    setTimeout(connect, 100);
  }, [connect, disconnect]);

  // Automatische Verbindung beim Mount
  useEffect(() => {
    connect();

    // Cleanup beim Unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Heartbeat-Timeout-Überwachung
  useEffect(() => {
    if (!heartbeat || !isConnected) return;

    const timeoutId = setTimeout(() => {
      const now = Date.now() / 1000;
      const lastHeartbeat = heartbeat.timestamp;
      
      // Wenn letzter Heartbeat älter als 30 Sekunden
      if (now - lastHeartbeat > 30) {
        console.warn('💓 Heartbeat-Timeout erkannt, reconnecting...');
        reconnect();
      }
    }, 35000); // Prüfe alle 35 Sekunden

    return () => clearTimeout(timeoutId);
  }, [heartbeat, isConnected, reconnect]);

  return {
    heartbeat,
    isConnected,
    isConnecting,
    error,
    reconnect
  };
};

export default useSystemHeartbeat;
