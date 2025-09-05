/**
 * Tests für StreamStatus-Komponente
 * 
 * Umfassende Unit-Tests für die KEI-Stream Status-Komponente mit
 * deutschen Kommentaren und englischen Bezeichnern.
 * 
 * @version 1.0.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StreamStatus } from '../StreamStatus';
import { ConnectionState } from '@/kei-stream/types';

// Mock für KEI-Stream Hooks
const mockKEIStream = {
  connectionState: ConnectionState.DISCONNECTED,
  status: {
    connectionState: ConnectionState.DISCONNECTED,
    reconnectAttempts: 0,
    streams: new Map(),
    totalFramesSent: 0,
    totalFramesReceived: 0,
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  lastError: null,
};

const mockStats = {
  totalStreams: 0,
  activeStreams: 0,
  totalFramesSent: 0,
  totalFramesReceived: 0,
  averageLatency: 0,
  errorRate: 0,
};

vi.mock('@/kei-stream/hooks', () => ({
  useKEIStream: () => mockKEIStream,
  useKEIStreamStats: () => mockStats,
}));

// Mock für UI-Komponenten
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3 data-testid="card-title">{children}</h3>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, size, variant }: any) => (
    <button 
      data-testid="button" 
      onClick={onClick} 
      disabled={disabled}
      data-size={size}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

describe('StreamStatus', () => {
  beforeEach(() => {
    // Reset mocks vor jedem Test
    vi.clearAllMocks();
    
    // Standard-Mock-Werte zurücksetzen
    mockKEIStream.connectionState = ConnectionState.DISCONNECTED;
    mockKEIStream.status.connectionState = ConnectionState.DISCONNECTED;
    mockKEIStream.lastError = null;
    mockStats.totalStreams = 0;
    mockStats.activeStreams = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Grundlegende Darstellung', () => {
    it('sollte die Komponente ohne Fehler rendern', () => {
      render(<StreamStatus />);
      
      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByText('KEI-Stream Status')).toBeInTheDocument();
    });

    it('sollte kompakte Darstellung korrekt anzeigen', () => {
      render(<StreamStatus compact />);
      
      expect(screen.getByText('Getrennt')).toBeInTheDocument();
      expect(screen.queryByText('KEI-Stream Status')).not.toBeInTheDocument();
    });

    it('sollte Debug-Informationen anzeigen wenn aktiviert', () => {
      const config = {
        sessionId: 'test-session',
        url: 'ws://localhost:8000/stream/ws/test',
        scopes: ['kei.stream.read'],
      };

      render(<StreamStatus config={config} showDebug />);
      
      expect(screen.getByText('Debug-Informationen')).toBeInTheDocument();
      expect(screen.getByText(/Session ID: test-session/)).toBeInTheDocument();
    });
  });

  describe('Verbindungsstatus-Anzeige', () => {
    it('sollte "Getrennt" Status korrekt anzeigen', () => {
      mockKEIStream.connectionState = ConnectionState.DISCONNECTED;
      
      render(<StreamStatus />);
      
      expect(screen.getByText('Getrennt')).toBeInTheDocument();
      expect(screen.getByTestId('badge')).toHaveAttribute('data-variant', 'outline');
    });

    it('sollte "Verbunden" Status korrekt anzeigen', () => {
      mockKEIStream.connectionState = ConnectionState.CONNECTED;
      mockKEIStream.status.connectionState = ConnectionState.CONNECTED;
      mockKEIStream.status.connectedAt = new Date('2024-01-01T10:00:00Z');
      
      render(<StreamStatus />);
      
      expect(screen.getByText('Verbunden')).toBeInTheDocument();
      expect(screen.getByTestId('badge')).toHaveAttribute('data-variant', 'default');
      expect(screen.getByText(/Verbunden seit:/)).toBeInTheDocument();
    });

    it('sollte "Verbinde..." Status korrekt anzeigen', () => {
      mockKEIStream.connectionState = ConnectionState.CONNECTING;
      
      render(<StreamStatus />);
      
      expect(screen.getByText('Verbinde...')).toBeInTheDocument();
      expect(screen.getByTestId('badge')).toHaveAttribute('data-variant', 'secondary');
    });

    it('sollte "Fehler" Status korrekt anzeigen', () => {
      mockKEIStream.connectionState = ConnectionState.ERROR;
      mockKEIStream.lastError = new Error('Verbindungsfehler');
      
      render(<StreamStatus />);
      
      expect(screen.getByText('Fehler')).toBeInTheDocument();
      expect(screen.getByText('Verbindungsfehler')).toBeInTheDocument();
      expect(screen.getByTestId('badge')).toHaveAttribute('data-variant', 'destructive');
    });

    it('sollte Wiederverbindungsversuche anzeigen', () => {
      mockKEIStream.status.reconnectAttempts = 3;
      
      render(<StreamStatus />);
      
      expect(screen.getByText('Wiederverbindungsversuche: 3')).toBeInTheDocument();
    });
  });

  describe('Benutzerinteraktionen', () => {
    it('sollte Verbinden-Button bei getrennter Verbindung anzeigen', () => {
      mockKEIStream.connectionState = ConnectionState.DISCONNECTED;
      
      render(<StreamStatus />);
      
      const connectButton = screen.getByText('Verbinden');
      expect(connectButton).toBeInTheDocument();
      expect(connectButton).not.toBeDisabled();
    });

    it('sollte connect() aufrufen wenn Verbinden-Button geklickt wird', async () => {
      mockKEIStream.connectionState = ConnectionState.DISCONNECTED;
      
      render(<StreamStatus />);
      
      const connectButton = screen.getByText('Verbinden');
      fireEvent.click(connectButton);
      
      await waitFor(() => {
        expect(mockKEIStream.connect).toHaveBeenCalledTimes(1);
      });
    });

    it('sollte Trennen-Button bei verbundener Verbindung anzeigen', () => {
      mockKEIStream.connectionState = ConnectionState.CONNECTED;
      
      render(<StreamStatus />);
      
      const disconnectButton = screen.getByText('Trennen');
      expect(disconnectButton).toBeInTheDocument();
      expect(disconnectButton).not.toBeDisabled();
    });

    it('sollte disconnect() aufrufen wenn Trennen-Button geklickt wird', async () => {
      mockKEIStream.connectionState = ConnectionState.CONNECTED;
      
      render(<StreamStatus />);
      
      const disconnectButton = screen.getByText('Trennen');
      fireEvent.click(disconnectButton);
      
      await waitFor(() => {
        expect(mockKEIStream.disconnect).toHaveBeenCalledTimes(1);
      });
    });

    it('sollte onConnectionChange Callback aufrufen', () => {
      const onConnectionChange = vi.fn();
      
      render(<StreamStatus onConnectionChange={onConnectionChange} />);
      
      expect(onConnectionChange).toHaveBeenCalledWith(ConnectionState.DISCONNECTED);
    });
  });

  describe('Statistiken-Anzeige', () => {
    it('sollte Stream-Statistiken korrekt anzeigen', () => {
      mockStats.totalStreams = 5;
      mockStats.activeStreams = 2;
      mockStats.totalFramesSent = 100;
      mockStats.totalFramesReceived = 150;
      
      render(<StreamStatus />);
      
      expect(screen.getByText('5')).toBeInTheDocument(); // Gesamt Streams
      expect(screen.getByText('2')).toBeInTheDocument(); // Aktive Streams
      expect(screen.getByText('100')).toBeInTheDocument(); // Frames gesendet
      expect(screen.getByText('150')).toBeInTheDocument(); // Frames empfangen
    });

    it('sollte aktive Streams in kompakter Ansicht anzeigen', () => {
      mockStats.activeStreams = 3;
      
      render(<StreamStatus compact />);
      
      expect(screen.getByText('3 aktiv')).toBeInTheDocument();
    });

    it('sollte keine aktiven Streams in kompakter Ansicht verbergen', () => {
      mockStats.activeStreams = 0;
      
      render(<StreamStatus compact />);
      
      expect(screen.queryByText('aktiv')).not.toBeInTheDocument();
    });
  });

  describe('Aktive Streams-Liste', () => {
    it('sollte aktive Streams anzeigen wenn vorhanden', () => {
      const mockStream = {
        streamId: 'test-stream',
        lastSeq: 42,
        creditWindow: 16,
        pendingFrames: 2,
        lastActivity: new Date(),
        isActive: true,
      };
      
      mockKEIStream.status.streams = new Map([['test-stream', mockStream]]);
      mockStats.activeStreams = 1;
      
      render(<StreamStatus />);
      
      expect(screen.getByText('Aktive Streams')).toBeInTheDocument();
      expect(screen.getByText('test-stream')).toBeInTheDocument();
      expect(screen.getByText('Seq: 42 | Credits: 16')).toBeInTheDocument();
      expect(screen.getByText('2 wartend')).toBeInTheDocument();
    });

    it('sollte keine aktiven Streams-Sektion anzeigen wenn keine vorhanden', () => {
      mockStats.activeStreams = 0;
      
      render(<StreamStatus />);
      
      expect(screen.queryByText('Aktive Streams')).not.toBeInTheDocument();
    });
  });

  describe('Konfiguration', () => {
    it('sollte Konfiguration korrekt verarbeiten', () => {
      const config = {
        url: 'ws://test.example.com/stream/ws/session',
        sessionId: 'test-session-123',
        apiToken: 'test-token',
        tenantId: 'test-tenant',
        scopes: ['kei.stream.read', 'kei.stream.write'],
      };
      
      render(<StreamStatus config={config} showDebug />);
      
      expect(screen.getByText(/Session ID: test-session-123/)).toBeInTheDocument();
      expect(screen.getByText(/URL: ws:\/\/test\.example\.com/)).toBeInTheDocument();
      expect(screen.getByText(/Tenant ID: test-tenant/)).toBeInTheDocument();
      expect(screen.getByText(/Scopes: kei\.stream\.read, kei\.stream\.write/)).toBeInTheDocument();
    });

    it('sollte Standard-Werte für fehlende Konfiguration anzeigen', () => {
      render(<StreamStatus showDebug />);
      
      expect(screen.getByText(/Session ID: Nicht gesetzt/)).toBeInTheDocument();
      expect(screen.getByText(/URL: Nicht gesetzt/)).toBeInTheDocument();
      expect(screen.getByText(/Tenant ID: Nicht gesetzt/)).toBeInTheDocument();
      expect(screen.getByText(/Scopes: Keine/)).toBeInTheDocument();
    });
  });
});
