import React, { useEffect, useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Nav from '@/components/nav/nav.tsx';
import cn from 'classnames';
import { CheckCircle, AlertTriangle, XCircle, Clock, Heart, Wifi, WifiOff } from 'lucide-react';
import { useSystemHeartbeat } from '@/hooks/useSystemHeartbeat';
import { API_ENDPOINT as API_BASE } from '@/store/endpoint';

// CSS-in-JS für Heartbeat-Animation
const heartbeatStyle = {
  animation: 'heartbeat 1.5s ease-in-out infinite',
  fill: 'currentColor'
};

// Keyframes für die Heartbeat-Animation
const heartbeatKeyframes = `
  @keyframes heartbeat {
    0% { transform: scale(1); }
    14% { transform: scale(1.3); }
    28% { transform: scale(1); }
    42% { transform: scale(1.3); }
    70% { transform: scale(1); }
  }
`;

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    color: `rgba(15,23,42,${0.1 + i * 0.03})`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className='absolute inset-0 pointer-events-none'>
      <svg className='w-full h-full text-dark' viewBox='0 0 696 316' fill='none'>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke='currentColor'
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'linear',
            }}
          />
        ))}
      </svg>
    </div>
  );
}

const AnimatedOutlet = () => {
  const location = useLocation();
  const element = useOutlet();
  return (
    <AnimatePresence mode='wait' initial={true}>
      {element && React.cloneElement(element, { key: location.pathname })}
    </AnimatePresence>
  );
};

// System Status Interface
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

const Layout = () => {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isFirstRender, setIsFirstRender] = useState(true);
  const [canInstall, setCanInstall] = useState<boolean>(localStorage.getItem('keiko_can_install') === '1');
  const [showStatusDetails, setShowStatusDetails] = useState(false);

  // WebSocket-basiertes System Heartbeat
  const { heartbeat, isConnected, isConnecting, error: heartbeatError, reconnect } = useSystemHeartbeat();

  // Legacy SystemStatus für Kompatibilität - konvertiere Heartbeat zu SystemStatus
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [lastStatusUpdate, setLastStatusUpdate] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Konvertiere Heartbeat zu SystemStatus Format
  useEffect(() => {
    if (heartbeat) {
      const convertedStatus: SystemStatus = {
        ready: heartbeat.overall_status === 'healthy',
        phase: heartbeat.phase as 'ready' | 'starting' | 'failed' | 'error',
        services: heartbeat.summary,
        message: heartbeat.message,
        timestamp: new Date(heartbeat.timestamp * 1000).toISOString()
      };
      setSystemStatus(convertedStatus);
      setLastStatusUpdate(new Date());
    }
  }, [heartbeat]);

  // System Status abrufen - verwende Heartbeat-Endpunkt für Live-Daten
  const fetchSystemStatus = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${API_BASE}/api/v1/system/heartbeat`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token-12345'
        },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        // Konvertiere Heartbeat-Daten zu SystemStatus-Format
        const systemStatus: SystemStatus = {
          timestamp: new Date(data.timestamp * 1000).toISOString(),
          phase: data.phase || 'ready',
          progress: data.overall_status === 'healthy' ? 100 :
                   data.overall_status === 'degraded' ? 75 : 50,
          ready: data.overall_status === 'healthy',
          services: {
            total: data.summary?.total || 0,
            healthy: data.summary?.healthy || 0,
            starting: data.summary?.starting || 0,
            failed: data.summary?.failed || 0,
          },
          failed_services: [],
          message: data.message || 'System Status'
        };
        setSystemStatus(systemStatus);
        setLastStatusUpdate(new Date());
        setFetchError(null);
      } else {
        // Falls Backend 4xx/5xx liefert → Status resetten
        setSystemStatus(null);
        setFetchError(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn('Fehler beim Abrufen des System-Status:', error);
      setSystemStatus(null); // Phantom-Status vermeiden
      setFetchError('Network error');
    } finally {
      clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    setIsFirstRender(false);

    // CSS-Keyframes für Heartbeat-Animation hinzufügen
    const style = document.createElement('style');
    style.textContent = heartbeatKeyframes;
    document.head.appendChild(style);

    // System Status initial abrufen
    fetchSystemStatus();

    const t = setInterval(() => {
      if (localStorage.getItem('keiko_can_install') === '1') setCanInstall(true)

      // System Status alle 15 Sekunden aktualisieren (häufiger für Live-Heartbeat)
      fetchSystemStatus();
    }, fetchError ? 10000 : 15000)

    return () => {
      clearInterval(t);
      // Cleanup: Style-Element entfernen
      document.head.removeChild(style);
    }
  }, [fetchError]);

  // Status-Icon bestimmen - mit pulsierendem Herz für gesunde Systeme
  const getStatusIcon = () => {
    if (!systemStatus) return <Clock className="h-4 w-4 text-gray-500" />;

    if (systemStatus.ready && systemStatus.phase === 'ready') {
      return (
        <Heart
          className="h-4 w-4 text-red-500"
          style={heartbeatStyle}
        />
      );
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

  return (
    <div className='min-h-screen relative flex flex-col justify-center items-center overflow-hidden'>
      <motion.div
        className='absolute top-1/2 left-4/5 transform -translate-x-1/2 -translate-y-1/2'
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: 0.4,
          scale: { type: 'spring', duration: 0.8, bounce: 0.5 },
        }}
      >
        <div className="opacity-20 w-[70vw] h-[70vh] bg-[url('/icons/Logo_Keiko_333333.svg')] bg-no-repeat bg-center bg-contain z-[-1] pointer-events-none"></div>
      </motion.div>
      <div className='absolute inset-0'>
        <FloatingPaths position={-1} />
        <FloatingPaths position={1} />
      </div>
      {/* Überlagernder dunkler Hintergrund */}
      <div className='absolute top-0 left-0 w-full h-full bg-primary opacity-90 z-0 pointer-events-none'></div>
      {/* Hauptinhalt */}
      <div className='z-10 flex h-screen w-screen relative'>
        {/* Install/Update Toasts */}
        <div className='absolute top-3 right-3 flex flex-col gap-2'>
          {canInstall && (
            <button
              className='px-3 py-2 rounded bg-blue-600 text-white shadow'
              onClick={async () => {
                // Versuche deferred prompt aufzurufen
                const anyWin = window as any
                if (anyWin.deferredPrompt) {
                  await anyWin.deferredPrompt.prompt()
                  const choice = await anyWin.deferredPrompt.userChoice
                  if (choice.outcome === 'accepted') {
                    localStorage.removeItem('keiko_can_install')
                    setCanInstall(false)
                  } else {
                    // Prompt abgelehnt – später erneut erlauben
                    localStorage.setItem('keiko_can_install', '0')
                    setCanInstall(false)
                  }
                } else {
                  // Fallback: LocalStorage-Flag entfernen
                  localStorage.removeItem('keiko_can_install')
                  setCanInstall(false)
                }
              }}
            >App installieren</button>
          )}
          {/* System Status Indikator */}
          <div className="relative">
            <div
              className={`px-3 py-2 rounded ${getStatusColor()} text-white shadow flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity`}
              onClick={() => setShowStatusDetails(!showStatusDetails)}
            >
              {getStatusIcon()}
              <span className="text-sm">{getStatusText()}</span>
              <span className="text-xs opacity-75">
                {lastStatusUpdate.toLocaleTimeString()}
              </span>
            </div>

            {/* Detaillierte Status-Ansicht */}
            {showStatusDetails && (
              <div className="absolute top-12 right-0 bg-white rounded-lg shadow-lg border p-4 min-w-[300px] z-50">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-gray-800">System Status</h3>
                    <button
                      onClick={() => setShowStatusDetails(false)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  </div>

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
                        <div className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded">
                          {systemStatus.message}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-gray-400 text-center pt-2 border-t">
                    Letztes Update: {lastStatusUpdate.toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>


        </div>
        <div className='w-[300px]'>
          <Nav isOpen={isNavOpen} onToggle={setIsNavOpen} />
        </div>
        <motion.div
          className={cn('flex-1 p-4 h-screen overflow-hidden relative')}
          animate={{
            marginLeft: isNavOpen ? '1px' : '-225px',
          }}
          transition={
            isFirstRender
              ? { duration: 0 } // Keine Transition bei initialem Render (inkl. Reload oder Aufruf)
              : {
                  duration: isNavOpen ? 0.2 : 1.0,
                  ease: 'easeInOut',
                }
          }
        >
          <AnimatedOutlet />
        </motion.div>
      </div>
    </div>
  );
};

export default Layout;
