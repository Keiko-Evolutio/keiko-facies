import { createBrowserRouter } from 'react-router-dom';
import Keiko from '@/views/keiko/Keiko.tsx';
import Layout from '@/components/layout/layout.tsx';
import StreamDashboard from '@/components/kei-stream/StreamDashboard';
import StartupOrchestrator from '@/components/startup/StartupOrchestrator';
import StartupGuard from '@/components/startup/StartupGuard';

const router = createBrowserRouter([
  {
    path: '/startup',
    element: <StartupOrchestrator
      onStartupComplete={() => {
        // Markiere Startup als abgeschlossen im localStorage
        localStorage.setItem('keiko-startup-completed', 'true');
        window.location.href = '/';
      }}
      onStartupFailed={(error) => {
        localStorage.removeItem('keiko-startup-completed');
        console.error('Startup failed:', error);
      }}
    />,
  },
  {
    path: '/',
    element: <StartupGuard><Layout /></StartupGuard>,
    children: [
      { index: true, element: <Keiko /> },
      { path: 'kei-stream', element: <StreamDashboard /> },
    ],
  },
]);

export default router;
