import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { API_ENDPOINT as API_BASE } from '@/store/endpoint';

interface SystemStatus {
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
    services: Record<string, {
      status: 'healthy' | 'unhealthy' | 'starting' | 'failed' | 'unknown';
      category: 'base' | 'monitoring' | 'workflow' | 'edge' | 'tools';
      required: boolean;
      container: string;
    }>;
    summary: {
      total: number;
      healthy: number;
      unhealthy: number;
      starting: number;
      failed: number;
    };
  };
}

const SystemStatusIndicator: React.FC = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [infrastructureStatus, setInfrastructureStatus] = useState<InfrastructureStatus | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Status abrufen mit Timeout und robuster Fehlerbehandlung
  const fetchStatus = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s Timeout
    try {
      // System Status
      const systemResponse = await fetch(`${API_BASE}/api/v1/system/startup-status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token-12345'
        },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (systemResponse.ok) {
        const systemData: SystemStatus = await systemResponse.json();
        setSystemStatus(systemData);
        setFetchError(null);
      } else {
        // Backend antwortet, aber nicht OK → Fehlerzustand setzen
        setFetchError(`HTTP ${systemResponse.status}`);
      }

      // Infrastructure Status
      const infraResponse = await fetch(`${API_BASE}/api/v1/system/infrastructure`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token-12345'
        },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (infraResponse.ok) {
        const infraData: InfrastructureStatus = await infraResponse.json();
        setInfrastructureStatus(infraData);
        setFetchError(null);
      } else {
        setFetchError(`HTTP ${infraResponse.status}`);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.warn('Fehler beim Abrufen des System-Status:', error);
      setFetchError('Network error');
      // Bei Netzwerkfehlern: systemStatus zurücksetzen, um Phantom-"healthy" zu vermeiden
      setSystemStatus(null);
      setInfrastructureStatus(null);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Polling alle 30 Sekunden (pausiere bei Fehlzustand für schnelle Erholung)
  useEffect(() => {
    fetchStatus(); // Initialer Aufruf
    const interval = setInterval(fetchStatus, fetchError ? 10000 : 30000);
    return () => clearInterval(interval);
  }, [fetchError]);

  // Status-Icon bestimmen
  const getStatusIcon = () => {
    if (!systemStatus) return <Clock className="h-4 w-4 text-gray-500" />;
    
    if (systemStatus.ready && systemStatus.phase === 'ready') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    } else if (systemStatus.phase === 'failed' || systemStatus.phase === 'error') {
      return <XCircle className="h-4 w-4 text-red-500" />;
    } else {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  // Status-Text bestimmen
  const getStatusText = () => {
    if (!systemStatus) return 'Status wird geladen...';
    
    if (systemStatus.ready && systemStatus.phase === 'ready') {
      return `${systemStatus.services.healthy}/${systemStatus.services.total} Services Healthy`;
    } else if (systemStatus.phase === 'failed' || systemStatus.phase === 'error') {
      return 'System Error';
    } else {
      return 'System Starting...';
    }
  };

  // Status-Farbe bestimmen
  const getStatusColor = () => {
    if (!systemStatus) return 'bg-gray-600';

    if (systemStatus.ready && systemStatus.phase === 'ready') {
      return 'bg-green-600';
    } else if (systemStatus.phase === 'failed' || systemStatus.phase === 'error') {
      return 'bg-red-600';
    } else {
      return 'bg-yellow-600';
    }
  };

  // Defensive Anzeige: Wenn Fetch-Fehler oder kein Status → "System Offline"
  const renderCompactText = () => {
    if (fetchError && !systemStatus) return 'System Offline';
    return getStatusText();
  };

  const renderIcon = () => {
    if (fetchError && !systemStatus) return <XCircle className="h-4 w-4 text-red-500" />;
    return getStatusIcon();
  };

  const containerColor = () => {
    if (fetchError && !systemStatus) return 'bg-red-600';
    return getStatusColor();
  };

  return (
    <>
      {/* Kompakter Status-Indikator */}
      <div
        className={`px-3 py-2 rounded ${containerColor()} text-white shadow flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity`}
        onClick={() => setShowDetails(!showDetails)}
      >
        {renderIcon()}
        <span className="text-sm">{renderCompactText()}</span>
        <span className="text-xs opacity-75">
          {lastUpdate.toLocaleTimeString()}
        </span>
      </div>

      {/* Detaillierte Ansicht */}
      {showDetails && (
        <div className="absolute top-12 right-0 bg-white rounded-lg shadow-lg border p-4 min-w-[300px] z-50">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">System Status</h3>
              <button 
                onClick={() => setShowDetails(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {/* System Status */}
            {systemStatus && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Phase:</span>
                  <span className="text-sm font-medium">{systemStatus.phase}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Progress:</span>
                  <span className="text-sm font-medium">{systemStatus.progress}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Services:</span>
                  <span className="text-sm font-medium">
                    {systemStatus.services.healthy}/{systemStatus.services.total} Healthy
                  </span>
                </div>
                {systemStatus.message && (
                  <div className="text-xs text-gray-500 mt-2">
                    {systemStatus.message}
                  </div>
                )}
              </div>
            )}

            {/* Infrastructure Details */}
            {infrastructureStatus && infrastructureStatus.infrastructure.services && (
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Infrastructure Services</h4>
                <div className="space-y-1">
                  {Object.entries(infrastructureStatus.infrastructure.services).map(([name, service]) => (
                    <div key={name} className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">{name}</span>
                      <div className="flex items-center gap-1">
                        {service.status === 'healthy' ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : service.status === 'starting' ? (
                          <Clock className="h-3 w-3 text-yellow-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        <span className="text-xs">{service.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-gray-400 text-center pt-2 border-t">
              Letztes Update: {lastUpdate.toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SystemStatusIndicator;
