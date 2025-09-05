/**
 * KEI-Stream Status-Komponente
 * 
 * Zeigt den aktuellen Status der KEI-Stream-Verbindung und aller aktiven Streams an.
 * Bietet Echtzeit-Übersicht über Verbindungsqualität, Stream-Aktivität und Statistiken.
 * 
 * @version 1.0.0
 */

import React from 'react';
import { ConnectionState, StreamStatus as StreamStatusType } from '@/kei-stream/types';
import { useKEIStream, useKEIStreamStats } from '@/kei-stream/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Users,
  MessageSquare
} from 'lucide-react';

interface StreamStatusProps {
  /** Konfiguration für KEI-Stream-Verbindung */
  config?: {
    url?: string;
    sessionId?: string;
    apiToken?: string;
    tenantId?: string;
    scopes?: string[];
  };
  /** Kompakte Darstellung aktivieren */
  compact?: boolean;
  /** Debug-Informationen anzeigen */
  showDebug?: boolean;
  /** Callback bei Verbindungsänderung */
  onConnectionChange?: (state: ConnectionState) => void;
}

/**
 * Haupt-Status-Komponente für KEI-Stream
 */
export const StreamStatus: React.FC<StreamStatusProps> = ({
  config = {},
  compact = false,
  showDebug = false,
  onConnectionChange,
}) => {
  const keiStream = useKEIStream({
    ...config,
    autoConnect: true,
    debug: showDebug,
  });
  const stats = useKEIStreamStats(config);

  // Callback bei Verbindungsänderung
  React.useEffect(() => {
    onConnectionChange?.(keiStream.connectionState);
  }, [keiStream.connectionState, onConnectionChange]);

  // Verbindungsstatus-Icon und -Farbe bestimmen
  const getConnectionDisplay = () => {
    switch (keiStream.connectionState) {
      case ConnectionState.CONNECTED:
        return {
          icon: <CheckCircle className="h-4 w-4" />,
          color: 'bg-green-500',
          text: 'Verbunden',
          variant: 'default' as const,
        };
      case ConnectionState.CONNECTING:
        return {
          icon: <Clock className="h-4 w-4 animate-spin" />,
          color: 'bg-yellow-500',
          text: 'Verbinde...',
          variant: 'secondary' as const,
        };
      case ConnectionState.RECONNECTING:
        return {
          icon: <Activity className="h-4 w-4 animate-pulse" />,
          color: 'bg-orange-500',
          text: 'Wiederverbindung...',
          variant: 'secondary' as const,
        };
      case ConnectionState.ERROR:
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          color: 'bg-red-500',
          text: 'Fehler',
          variant: 'destructive' as const,
        };
      default:
        return {
          icon: <WifiOff className="h-4 w-4" />,
          color: 'bg-gray-500',
          text: 'Getrennt',
          variant: 'outline' as const,
        };
    }
  };

  const connectionDisplay = getConnectionDisplay();

  // Kompakte Darstellung
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${connectionDisplay.color}`} />
        <span className="text-sm font-medium">{connectionDisplay.text}</span>
        {stats.activeStreams > 0 && (
          <Badge variant="outline" className="text-xs">
            {stats.activeStreams} aktiv
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hauptstatus-Karte */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            KEI-Stream Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Verbindungsstatus */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {connectionDisplay.icon}
              <span className="font-medium">{connectionDisplay.text}</span>
            </div>
            <div className="flex gap-2">
              <Badge variant={connectionDisplay.variant}>
                {keiStream.connectionState}
              </Badge>
              {keiStream.connectionState === ConnectionState.DISCONNECTED && (
                <Button
                  size="sm"
                  onClick={() => keiStream.connect()}
                  disabled={keiStream.connectionState === ConnectionState.CONNECTING}
                >
                  Verbinden
                </Button>
              )}
              {keiStream.connectionState === ConnectionState.CONNECTED && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => keiStream.disconnect()}
                >
                  Trennen
                </Button>
              )}
            </div>
          </div>

          {/* Verbindungszeit */}
          {keiStream.status.connectedAt && (
            <div className="text-sm text-muted-foreground">
              Verbunden seit: {keiStream.status.connectedAt.toLocaleTimeString()}
            </div>
          )}

          {/* Fehleranzeige */}
          {keiStream.lastError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Verbindungsfehler</span>
              </div>
              <p className="text-sm text-red-700 mt-1">
                {keiStream.lastError.message}
              </p>
            </div>
          )}

          {/* Wiederverbindungsversuche */}
          {keiStream.status.reconnectAttempts > 0 && (
            <div className="text-sm text-muted-foreground">
              Wiederverbindungsversuche: {keiStream.status.reconnectAttempts}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistiken-Karte */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Stream-Statistiken
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{stats.totalStreams}</span>
              </div>
              <p className="text-sm text-muted-foreground">Gesamt Streams</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Activity className="h-4 w-4 text-green-500" />
                <span className="text-2xl font-bold text-green-600">
                  {stats.activeStreams}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Aktive Streams</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <span className="text-2xl font-bold text-blue-600">
                  {stats.totalFramesSent}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Frames gesendet</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <MessageSquare className="h-4 w-4 text-purple-500" />
                <span className="text-2xl font-bold text-purple-600">
                  {stats.totalFramesReceived}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Frames empfangen</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Aktive Streams */}
      {stats.activeStreams > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Aktive Streams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from(keiStream.status.streams.entries())
                .filter(([, stream]) => stream.isActive)
                .map(([streamId, stream]) => (
                  <StreamItem key={streamId} streamId={streamId} stream={stream} />
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug-Informationen */}
      {showDebug && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Debug-Informationen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm font-mono">
              <div>Session ID: {config.sessionId || 'Nicht gesetzt'}</div>
              <div>URL: {config.url || 'Nicht gesetzt'}</div>
              <div>Scopes: {config.scopes?.join(', ') || 'Keine'}</div>
              <div>Tenant ID: {config.tenantId || 'Nicht gesetzt'}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

/**
 * Einzelner Stream-Eintrag
 */
interface StreamItemProps {
  streamId: string;
  stream: StreamStatusType;
}

const StreamItem: React.FC<StreamItemProps> = ({ streamId, stream }) => {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-green-500 rounded-full" />
        <div>
          <div className="font-medium">{streamId}</div>
          <div className="text-sm text-muted-foreground">
            Seq: {stream.lastSeq} | Credits: {stream.creditWindow}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {stream.pendingFrames > 0 && (
          <Badge variant="outline" className="text-xs">
            {stream.pendingFrames} wartend
          </Badge>
        )}
        <div className="text-xs text-muted-foreground">
          {stream.lastActivity.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default StreamStatus;
