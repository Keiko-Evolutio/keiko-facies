import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useStartupOrchestration } from '@/hooks/useStartupOrchestration';

interface StartupGuardProps {
  children: React.ReactNode;
}

/**
 * StartupGuard Component
 * Schützt Routen vor dem Zugriff, bevor das System vollständig gestartet ist
 * Leitet zur Startup-Seite weiter, wenn das System nicht bereit ist
 */
const StartupGuard: React.FC<StartupGuardProps> = ({ children }) => {
  const [initialCheckComplete, setInitialCheckComplete] = useState(false);
  
  const {
    isReady,
    isStarting,
    hasFailed,
    checkReadiness
  } = useStartupOrchestration({
    autoStart: false, // Kein Auto-Start, nur Status-Prüfung
  });

  // Initiale Readiness-Prüfung
  useEffect(() => {
    const performInitialCheck = async () => {
      try {
        // Prüfe zuerst localStorage
        const startupCompleted = localStorage.getItem('keiko-startup-completed');
        if (startupCompleted === 'true') {
          setInitialCheckComplete(true);
          return; // Startup bereits abgeschlossen, keine weitere Prüfung nötig
        }

        const ready = await checkReadiness();
        setInitialCheckComplete(true);

        // Wenn nicht bereit, zur Startup-Seite weiterleiten
        if (!ready) {
          window.location.href = '/startup';
        }
      } catch (error) {
        console.error('Fehler bei der initialen Readiness-Prüfung:', error);
        setInitialCheckComplete(true);
        // Bei Fehler zur Startup-Seite weiterleiten
        window.location.href = '/startup';
      }
    };

    performInitialCheck();
  }, [checkReadiness]);

  // Während der initialen Prüfung Loading anzeigen
  if (!initialCheckComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">System wird überprüft...</p>
        </div>
      </div>
    );
  }

  // Wenn System nicht bereit ist, zur Startup-Seite weiterleiten
  // Aber nur wenn Startup nicht bereits im localStorage als abgeschlossen markiert ist
  const startupCompleted = localStorage.getItem('keiko-startup-completed');
  if (startupCompleted !== 'true' && (!isReady || isStarting || hasFailed)) {
    return <Navigate to="/startup" replace />;
  }

  // Wenn System bereit ist, Kinder-Komponenten rendern
  return <>{children}</>;
};

export default StartupGuard;
