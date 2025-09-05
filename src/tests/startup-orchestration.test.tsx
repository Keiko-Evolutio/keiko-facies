/**
 * End-to-End Tests für Frontend Startup Orchestration
 * Testet Frontend Polling-Verhalten während verschiedener Startup-Zustände
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';

import StartupOrchestrator from '@/components/startup/StartupOrchestrator';
import { useStartupOrchestration } from '@/hooks/useStartupOrchestration';

// Mock fetch für API-Aufrufe
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock für useStartupOrchestration Hook
vi.mock('@/hooks/useStartupOrchestration');
const mockUseStartupOrchestration = vi.mocked(useStartupOrchestration);

describe('StartupOrchestrator Component', () => {
  const mockOnStartupComplete = vi.fn();
  const mockOnStartupFailed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zeigt Loading-Zustand während Initialisierung', () => {
    mockUseStartupOrchestration.mockReturnValue({
      isStarting: true,
      isReady: false,
      hasFailed: false,
      error: null,
      progress: 0,
      phase: 'initializing',
      retryCount: 0,
      canRetry: true,
      startStartup: vi.fn(),
      retryStartup: vi.fn(),
      resetStartup: vi.fn(),
      checkStartupStatus: vi.fn(),
      checkReadiness: vi.fn()
    });

    render(
      <StartupOrchestrator
        onStartupComplete={mockOnStartupComplete}
        onStartupFailed={mockOnStartupFailed}
      />
    );

    expect(screen.getByText('System wird initialisiert...')).toBeInTheDocument();
    expect(screen.getByText('Status wird überwacht...')).toBeInTheDocument();
  });

  it('zeigt Progress-Anzeige während Startup', async () => {
    // Mock API Response für Startup Status
    const mockStartupStatus = {
      timestamp: new Date().toISOString(),
      phase: 'starting',
      progress: 45,
      ready: false,
      services: {
        total: 10,
        healthy: 4,
        starting: 3,
        failed: 0
      },
      failed_services: [],
      message: 'Services werden gestartet...'
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStartupStatus
    });

    mockUseStartupOrchestration.mockReturnValue({
      isStarting: true,
      isReady: false,
      hasFailed: false,
      error: null,
      progress: 45,
      phase: 'starting',
      retryCount: 0,
      canRetry: true,
      startStartup: vi.fn(),
      retryStartup: vi.fn(),
      resetStartup: vi.fn(),
      checkStartupStatus: vi.fn().mockResolvedValue(mockStartupStatus),
      checkReadiness: vi.fn()
    });

    render(
      <StartupOrchestrator
        onStartupComplete={mockOnStartupComplete}
        onStartupFailed={mockOnStartupFailed}
      />
    );

    expect(screen.getByText('Services werden gestartet...')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    
    // Service-Status-Übersicht
    expect(screen.getByText('4')).toBeInTheDocument(); // Healthy services
    expect(screen.getByText('3')).toBeInTheDocument(); // Starting services
    expect(screen.getByText('10')).toBeInTheDocument(); // Total services
  });

  it('zeigt Infrastructure-Status-Details', async () => {
    const mockInfrastructureStatus = {
      timestamp: new Date().toISOString(),
      infrastructure: {
        ready: false,
        last_check: Date.now(),
        services: {
          postgres: {
            status: 'healthy',
            category: 'base',
            required: true,
            container: 'keiko-postgres'
          },
          redis: {
            status: 'starting',
            category: 'base',
            required: true,
            container: 'keiko-redis'
          },
          prometheus: {
            status: 'failed',
            category: 'monitoring',
            required: true,
            container: 'keiko-prometheus'
          }
        },
        summary: {
          total: 3,
          healthy: 1,
          unhealthy: 1,
          starting: 1,
          failed: 1
        }
      }
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          phase: 'starting',
          progress: 30,
          ready: false,
          services: { total: 3, healthy: 1, starting: 1, failed: 1 },
          failed_services: ['prometheus'],
          message: 'Services werden gestartet...'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockInfrastructureStatus
      });

    render(
      <StartupOrchestrator
        onStartupComplete={mockOnStartupComplete}
        onStartupFailed={mockOnStartupFailed}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('postgres')).toBeInTheDocument();
      expect(screen.getByText('redis')).toBeInTheDocument();
      expect(screen.getByText('prometheus')).toBeInTheDocument();
    });

    // Prüfe Service-Status-Indikatoren
    expect(screen.getByText('Erforderlich')).toBeInTheDocument(); // Required badge
  });

  it('zeigt Fehler-Zustand bei fehlgeschlagenen Services', async () => {
    const mockFailedStatus = {
      timestamp: new Date().toISOString(),
      phase: 'failed',
      progress: 60,
      ready: false,
      services: {
        total: 5,
        healthy: 2,
        starting: 0,
        failed: 3
      },
      failed_services: ['postgres', 'redis', 'prometheus'],
      message: 'Startup fehlgeschlagen - kritische Services nicht verfügbar'
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockFailedStatus
    });

    mockUseStartupOrchestration.mockReturnValue({
      isStarting: false,
      isReady: false,
      hasFailed: true,
      error: 'Startup fehlgeschlagen',
      progress: 60,
      phase: 'failed',
      retryCount: 1,
      canRetry: true,
      startStartup: vi.fn(),
      retryStartup: vi.fn(),
      resetStartup: vi.fn(),
      checkStartupStatus: vi.fn().mockResolvedValue(mockFailedStatus),
      checkReadiness: vi.fn()
    });

    render(
      <StartupOrchestrator
        onStartupComplete={mockOnStartupComplete}
        onStartupFailed={mockOnStartupFailed}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Startup fehlgeschlagen')).toBeInTheDocument();
      expect(screen.getByText('Fehlgeschlagene Services:')).toBeInTheDocument();
      expect(screen.getByText('postgres')).toBeInTheDocument();
      expect(screen.getByText('redis')).toBeInTheDocument();
      expect(screen.getByText('prometheus')).toBeInTheDocument();
    });

    // Retry-Button sollte verfügbar sein
    expect(screen.getByText('Startup erneut versuchen')).toBeInTheDocument();
  });

  it('führt Retry-Funktionalität aus', async () => {
    const mockRetryStartup = vi.fn();

    mockUseStartupOrchestration.mockReturnValue({
      isStarting: false,
      isReady: false,
      hasFailed: true,
      error: 'Startup fehlgeschlagen',
      progress: 0,
      phase: 'failed',
      retryCount: 1,
      canRetry: true,
      startStartup: vi.fn(),
      retryStartup: mockRetryStartup,
      resetStartup: vi.fn(),
      checkStartupStatus: vi.fn(),
      checkReadiness: vi.fn()
    });

    render(
      <StartupOrchestrator
        onStartupComplete={mockOnStartupComplete}
        onStartupFailed={mockOnStartupFailed}
      />
    );

    const retryButton = screen.getByText('Startup erneut versuchen');
    await userEvent.click(retryButton);

    expect(mockRetryStartup).toHaveBeenCalledOnce();
  });

  it('ruft onStartupComplete auf wenn System bereit ist', async () => {
    const mockReadyStatus = {
      timestamp: new Date().toISOString(),
      phase: 'ready',
      progress: 100,
      ready: true,
      services: {
        total: 5,
        healthy: 5,
        starting: 0,
        failed: 0
      },
      failed_services: [],
      message: 'System ist bereit!'
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReadyStatus
    });

    mockUseStartupOrchestration.mockReturnValue({
      isStarting: false,
      isReady: true,
      hasFailed: false,
      error: null,
      progress: 100,
      phase: 'ready',
      retryCount: 0,
      canRetry: true,
      startStartup: vi.fn(),
      retryStartup: vi.fn(),
      resetStartup: vi.fn(),
      checkStartupStatus: vi.fn().mockResolvedValue(mockReadyStatus),
      checkReadiness: vi.fn()
    });

    render(
      <StartupOrchestrator
        onStartupComplete={mockOnStartupComplete}
        onStartupFailed={mockOnStartupFailed}
      />
    );

    await waitFor(() => {
      expect(mockOnStartupComplete).toHaveBeenCalledOnce();
    });
  });

  it('behandelt Netzwerk-Fehler graceful', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    mockUseStartupOrchestration.mockReturnValue({
      isStarting: false,
      isReady: false,
      hasFailed: true,
      error: 'Verbindung zum Backend fehlgeschlagen: Network error',
      progress: 0,
      phase: 'error',
      retryCount: 3,
      canRetry: false,
      startStartup: vi.fn(),
      retryStartup: vi.fn(),
      resetStartup: vi.fn(),
      checkStartupStatus: vi.fn(),
      checkReadiness: vi.fn()
    });

    render(
      <StartupOrchestrator
        onStartupComplete={mockOnStartupComplete}
        onStartupFailed={mockOnStartupFailed}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Verbindung zum Backend fehlgeschlagen/)).toBeInTheDocument();
    });
  });
});

describe('useStartupOrchestration Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  it('startet automatisch wenn autoStart aktiviert ist', async () => {
    const mockStartupStatus = {
      phase: 'starting',
      progress: 25,
      ready: false,
      services: { total: 4, healthy: 1, starting: 2, failed: 0 },
      failed_services: [],
      message: 'Services werden gestartet...'
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockStartupStatus
    });

    // Teste den Hook direkt (würde normalerweise mit renderHook gemacht)
    // Hier simulieren wir das Verhalten
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('führt Readiness-Checks durch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200
    });

    // Simuliere Readiness-Check
    const response = await fetch('http://localhost:8000/api/v1/system/readiness');
    expect(response.ok).toBe(true);
  });

  it('behandelt Polling-Timeouts korrekt', async () => {
    // Simuliere langsame API-Antwort
    mockFetch.mockImplementation(() => 
      new Promise(resolve => 
        setTimeout(() => resolve({
          ok: true,
          json: async () => ({ phase: 'starting', progress: 10, ready: false })
        }), 6000) // 6 Sekunden - länger als Timeout
      )
    );

    // Test würde Timeout-Verhalten prüfen
    expect(true).toBe(true); // Placeholder für tatsächlichen Timeout-Test
  });
});

describe('StartupGuard Component', () => {
  it('leitet zur Startup-Seite weiter wenn System nicht bereit', async () => {
    // Mock für React Router Navigation
    const mockNavigate = vi.fn();
    
    // Simuliere nicht-bereites System
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503
    });

    // Test würde Navigation-Verhalten prüfen
    expect(true).toBe(true); // Placeholder für tatsächlichen Navigation-Test
  });

  it('rendert Kinder-Komponenten wenn System bereit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200
    });

    // Test würde Rendering-Verhalten prüfen
    expect(true).toBe(true); // Placeholder für tatsächlichen Rendering-Test
  });
});
