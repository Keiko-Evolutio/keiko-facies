import { useState, useEffect, useCallback } from 'react';

// Typen für Startup-Orchestrierung
interface StartupState {
  isStarting: boolean;
  isReady: boolean;
  hasFailed: boolean;
  error: string | null;
  progress: number;
  phase: string;
  retryCount: number;
}

interface UseStartupOrchestrationOptions {
  autoStart?: boolean;
  maxRetries?: number;
  pollInterval?: number;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

interface StartupStatus {
  timestamp: string;
  phase: 'initializing' | 'starting' | 'ready' | 'failed' | 'error';
  progress: number;
  ready: boolean;
  services: {
    total: number;
    healthy: number;
    starting: number;
    failed: number;
  };
  failed_services: string[];
  message: string;
}

/**
 * Hook für Startup-Orchestrierung
 * Verwaltet den Startup-Status und bietet Funktionen für Retry-Logik
 */
export const useStartupOrchestration = (options: UseStartupOrchestrationOptions = {}) => {
  const {
    autoStart = true,
    maxRetries = 3,
    pollInterval = 2500,
    onComplete,
    onError
  } = options;

  const [state, setState] = useState<StartupState>({
    isStarting: false,
    isReady: false,
    hasFailed: false,
    error: null,
    progress: 0,
    phase: 'initializing',
    retryCount: 0
  });

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const STARTUP_STATUS_URL = `${API_BASE}/api/v1/system/startup-status`;

  // Startup-Status prüfen
  const checkStartupStatus = useCallback(async (): Promise<StartupStatus | null> => {
    try {
      const response = await fetch(STARTUP_STATUS_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Fehler beim Abrufen des Startup-Status:', error);
      return null;
    }
  }, []);

  // Readiness prüfen - verwende den gleichen Endpunkt wie StartupOrchestrator
  const checkReadiness = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(STARTUP_STATUS_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token-12345'
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.ready === true && data.phase === 'ready';
    } catch (error) {
      console.error('Fehler beim Prüfen der Readiness:', error);
      return false;
    }
  }, []);

  // Startup-Prozess starten
  const startStartup = useCallback(async () => {
    setState(prev => ({
      ...prev,
      isStarting: true,
      isReady: false,
      hasFailed: false,
      error: null,
      progress: 0,
      phase: 'initializing'
    }));

    let pollCount = 0;
    const maxPolls = 300; // 5 Minuten bei 1s Intervall

    const poll = async () => {
      if (pollCount >= maxPolls) {
        setState(prev => ({
          ...prev,
          isStarting: false,
          hasFailed: true,
          error: 'Startup-Timeout erreicht'
        }));
        onError?.('Startup-Timeout erreicht');
        return;
      }

      const status = await checkStartupStatus();
      
      if (!status) {
        pollCount++;
        setTimeout(poll, pollInterval);
        return;
      }

      setState(prev => ({
        ...prev,
        progress: status.progress,
        phase: status.phase
      }));

      // Startup erfolgreich
      if (status.ready && status.phase === 'ready') {
        setState(prev => ({
          ...prev,
          isStarting: false,
          isReady: true,
          hasFailed: false,
          error: null
        }));
        onComplete?.();
        return;
      }

      // Startup fehlgeschlagen
      if (status.phase === 'failed' || status.phase === 'error') {
        setState(prev => ({
          ...prev,
          isStarting: false,
          hasFailed: true,
          error: status.message
        }));
        onError?.(status.message);
        return;
      }

      // Weiter pollen
      pollCount++;
      setTimeout(poll, pollInterval);
    };

    poll();
  }, [checkStartupStatus, pollInterval, onComplete, onError]);

  // Startup erneut versuchen
  const retryStartup = useCallback(() => {
    setState(prev => {
      const newRetryCount = prev.retryCount + 1;
      
      if (newRetryCount > maxRetries) {
        return {
          ...prev,
          hasFailed: true,
          error: `Maximale Anzahl von Wiederholungsversuchen (${maxRetries}) erreicht`
        };
      }

      return {
        ...prev,
        retryCount: newRetryCount,
        hasFailed: false,
        error: null
      };
    });

    startStartup();
  }, [startStartup, maxRetries]);

  // Reset-Funktion
  const resetStartup = useCallback(() => {
    setState({
      isStarting: false,
      isReady: false,
      hasFailed: false,
      error: null,
      progress: 0,
      phase: 'initializing',
      retryCount: 0
    });
  }, []);

  // Auto-Start-Effekt
  useEffect(() => {
    if (autoStart && !state.isStarting && !state.isReady && !state.hasFailed) {
      startStartup();
    }
  }, [autoStart, startStartup, state.isStarting, state.isReady, state.hasFailed]);

  // Periodische Readiness-Prüfung wenn System bereit ist
  useEffect(() => {
    if (!state.isReady) return;

    const interval = setInterval(async () => {
      const isReady = await checkReadiness();
      if (!isReady) {
        setState(prev => ({
          ...prev,
          isReady: false,
          hasFailed: true,
          error: 'System ist nicht mehr bereit'
        }));
        onError?.('System ist nicht mehr bereit');
      }
    }, 30000); // Alle 30 Sekunden prüfen

    return () => clearInterval(interval);
  }, [state.isReady, checkReadiness, onError]);

  return {
    // Status
    isStarting: state.isStarting,
    isReady: state.isReady,
    hasFailed: state.hasFailed,
    error: state.error,
    progress: state.progress,
    phase: state.phase,
    retryCount: state.retryCount,
    canRetry: state.retryCount < maxRetries,
    
    // Aktionen
    startStartup,
    retryStartup,
    resetStartup,
    
    // Hilfsfunktionen
    checkStartupStatus,
    checkReadiness
  };
};
