import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  RefreshCw,
  Server,
  Database,
  Activity,
  Workflow,
  Cpu
} from 'lucide-react';

// Typen für Startup Status
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

interface InfrastructureStatus {
  timestamp: string;
  infrastructure: {
    ready: boolean;
    last_check: number;
    services: Record<string, ServiceStatus>;
    summary: {
      total: number;
      healthy: number;
      unhealthy: number;
      starting: number;
      failed: number;
    };
  };
}

interface ServiceStatus {
  status: 'healthy' | 'unhealthy' | 'starting' | 'failed' | 'unknown';
  category: 'base' | 'monitoring' | 'workflow' | 'edge' | 'tools';
  required: boolean;
  container: string;
}

interface StartupOrchestratorProps {
  onStartupComplete: () => void;
  onStartupFailed: (error: string) => void;
}

const StartupOrchestrator: React.FC<StartupOrchestratorProps> = ({
  onStartupComplete,
  onStartupFailed
}) => {
  const [startupStatus, setStartupStatus] = useState<StartupStatus | null>(null);
  const [infrastructureStatus, setInfrastructureStatus] = useState<InfrastructureStatus | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Polling-Intervall (2-3 Sekunden)
  const POLL_INTERVAL = 2500;
  const MAX_RETRIES = 3;

  // Status-Polling-Funktion
  const pollStartupStatus = useCallback(async () => {
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE}/api/v1/system/startup-status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token-12345'
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const status: StartupStatus = await response.json();
      console.log('✅ Startup Status received:', status);
      setStartupStatus(status);
      setError(null);
      setRetryCount(0);

      // Prüfen ob Startup abgeschlossen
      if (status.ready && status.phase === 'ready') {
        setIsPolling(false);
        // Kurze Verzögerung, damit der Benutzer den Erfolg sehen kann
        setTimeout(() => {
          onStartupComplete();
        }, 2000); // 2 Sekunden Verzögerung
        return;
      }

      // Prüfen ob Startup fehlgeschlagen
      if (status.phase === 'failed' || status.phase === 'error') {
        setIsPolling(false);
        onStartupFailed(status.message);
        return;
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
      console.error('Fehler beim Abrufen des Startup-Status:', errorMessage);
      
      if (retryCount < MAX_RETRIES) {
        setRetryCount(prev => prev + 1);
      } else {
        setError(`Verbindung zum Backend fehlgeschlagen: ${errorMessage}`);
        setIsPolling(false);
        onStartupFailed(errorMessage);
      }
    }
  }, [retryCount, onStartupComplete, onStartupFailed]);

  // Infrastructure-Status abrufen
  const fetchInfrastructureStatus = useCallback(async () => {
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE}/api/v1/system/infrastructure`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token-12345'
        },
      });

      if (response.ok) {
        const status: InfrastructureStatus = await response.json();
        console.log('✅ Infrastructure Status received:', status);
        setInfrastructureStatus(status);
      }
    } catch (err) {
      console.warn('Infrastructure-Status konnte nicht abgerufen werden:', err);
    }
  }, []);

  // Polling-Effekt
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(() => {
      pollStartupStatus();
      fetchInfrastructureStatus();
    }, POLL_INTERVAL);

    // Initialer Aufruf
    pollStartupStatus();
    fetchInfrastructureStatus();

    return () => clearInterval(interval);
  }, [isPolling, pollStartupStatus, fetchInfrastructureStatus]);

  // Startup neu starten
  const handleRetryStartup = async () => {
    setError(null);
    setRetryCount(0);
    setStartupStatus(null);
    setInfrastructureStatus(null);
    setIsPolling(true);
  };

  // Status-Icon basierend auf Service-Status
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'starting':
        return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'failed':
      case 'unhealthy':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  // Kategorie-Icon
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'base':
        return <Database className="h-4 w-4" />;
      case 'monitoring':
        return <Activity className="h-4 w-4" />;
      case 'workflow':
        return <Workflow className="h-4 w-4" />;
      case 'edge':
        return <Cpu className="h-4 w-4" />;
      case 'tools':
        return <Server className="h-4 w-4" />;
      default:
        return <Server className="h-4 w-4" />;
    }
  };

  // Phase-Beschreibung
  const getPhaseDescription = (phase: string) => {
    switch (phase) {
      case 'initializing':
        return 'System wird initialisiert...';
      case 'starting':
        return 'Services werden gestartet...';
      case 'ready':
        return 'System ist bereit!';
      case 'failed':
        return 'Startup fehlgeschlagen';
      case 'error':
        return 'Systemfehler aufgetreten';
      default:
        return 'Status unbekannt';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-800">
            Keiko Personal Assistant
          </CardTitle>
          <p className="text-gray-600">System wird gestartet...</p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Haupt-Progress-Anzeige */}
          {startupStatus && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
                  {getPhaseDescription(startupStatus.phase)}
                </span>
                <span className="text-sm text-gray-500">
                  {startupStatus.progress}%
                </span>
              </div>
              
              <Progress 
                value={startupStatus.progress} 
                className="h-3"
              />
              
              <p className="text-sm text-gray-600 text-center">
                {startupStatus.message}
              </p>
            </div>
          )}

          {/* Service-Status-Übersicht */}
          {startupStatus && startupStatus.services && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {startupStatus.services.healthy || 0}
                </div>
                <div className="text-xs text-gray-500">Gesund</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {startupStatus.services.starting || 0}
                </div>
                <div className="text-xs text-gray-500">Startet</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {startupStatus.services.failed || 0}
                </div>
                <div className="text-xs text-gray-500">Fehler</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {startupStatus.services.total || 0}
                </div>
                <div className="text-xs text-gray-500">Gesamt</div>
              </div>
            </div>
          )}

          {/* Detaillierte Service-Liste */}
          {infrastructureStatus && infrastructureStatus.infrastructure && infrastructureStatus.infrastructure.services && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Service-Status
              </h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {Object.entries(infrastructureStatus.infrastructure.services).map(([name, service]) => (
                  <div key={name} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center space-x-2">
                      {getCategoryIcon(service.category)}
                      <span className="text-sm font-medium">{name}</span>
                      {service.required && (
                        <Badge variant="secondary" className="text-xs">
                          Erforderlich
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      {getStatusIcon(service.status)}
                      <span className="text-xs text-gray-500 capitalize">
                        {service.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fehler-Anzeige */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Fehlgeschlagene Services */}
          {startupStatus?.failed_services && startupStatus.failed_services.length > 0 && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">Fehlgeschlagene Services:</p>
                  <ul className="list-disc list-inside text-sm">
                    {startupStatus.failed_services.map((service, index) => (
                      <li key={index}>{service}</li>
                    ))}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Retry-Button */}
          {(error || startupStatus?.phase === 'failed') && (
            <div className="text-center">
              <Button 
                onClick={handleRetryStartup}
                className="w-full"
                variant="outline"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Startup erneut versuchen
              </Button>
            </div>
          )}

          {/* Loading-Indikator */}
          {isPolling && !error && (
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 text-sm text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Status wird überwacht...</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StartupOrchestrator;
