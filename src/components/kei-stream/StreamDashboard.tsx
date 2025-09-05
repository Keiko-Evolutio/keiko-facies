/**
 * KEI-Stream Management Dashboard
 * 
 * Zentrale Benutzeroberfläche für das Management von KEI-Stream-Verbindungen,
 * Session-Übersicht und Stream-Konfiguration.
 * 
 * @version 1.0.0
 */

import React, { useState, useCallback } from 'react';
import { ConnectionState, FrameType } from '@/kei-stream/types';
import { useKEIStream, useKEIStreamStats } from '@/kei-stream/hooks';
import StreamStatus from './StreamStatus';
import FrameVisualization from './FrameVisualization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  Play, 
  Square, 
  Send,
  Monitor,
  Activity,
  MessageSquare,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface StreamDashboardProps {
  /** Initiale Konfiguration */
  initialConfig?: {
    url?: string;
    sessionId?: string;
    apiToken?: string;
    tenantId?: string;
    scopes?: string[];
  };
  /** Callback bei Konfigurationsänderung */
  onConfigChange?: (config: any) => void;
}

/**
 * Haupt-Dashboard-Komponente
 */
export const StreamDashboard: React.FC<StreamDashboardProps> = ({
  initialConfig = {},
  onConfigChange,
}) => {
  // Konfigurationsstatus
  const [config, setConfig] = useState({
    url: initialConfig.url || 'ws://localhost:8000/stream/ws/frontend-session',
    sessionId: initialConfig.sessionId || 'frontend-session',
    apiToken: initialConfig.apiToken || '',
    tenantId: initialConfig.tenantId || '',
    scopes: initialConfig.scopes || ['kei.stream.read', 'kei.stream.write'],
  });

  // UI-Status
  const [activeTab, setActiveTab] = useState('overview');
  const [testStreamId, setTestStreamId] = useState('test-stream');
  const [testPayload, setTestPayload] = useState('{\n  "message": "Test-Nachricht",\n  "timestamp": "' + new Date().toISOString() + '"\n}');

  // KEI-Stream-Integration
  const keiStream = useKEIStream({
    ...config,
    autoConnect: false, // Manuelle Verbindung über UI
    debug: true,
  });
  const stats = useKEIStreamStats(config);

  // Konfiguration aktualisieren
  const updateConfig = useCallback((newConfig: Partial<typeof config>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    onConfigChange?.(updatedConfig);
  }, [config, onConfigChange]);

  // Test-Frame senden
  const sendTestFrame = useCallback(() => {
    try {
      const payload = JSON.parse(testPayload);
      keiStream.sendFrame(testStreamId, FrameType.PARTIAL, payload);
    } catch (error) {
      console.error('Fehler beim Senden des Test-Frames:', error);
    }
  }, [keiStream.sendFrame, testStreamId, testPayload]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">KEI-Stream Dashboard</h1>
          <p className="text-muted-foreground">
            Verwalten Sie KEI-Stream-Verbindungen und überwachen Sie Echtzeit-Datenströme
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StreamStatus config={config} compact />
        </div>
      </div>

      {/* Haupt-Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="streams" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Streams
          </TabsTrigger>
          <TabsTrigger value="testing" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Testing
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Einstellungen
          </TabsTrigger>
        </TabsList>

        {/* Übersicht-Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Verbindungsstatus */}
            <StreamStatus config={config} showDebug />
            
            {/* Schnellaktionen */}
            <Card>
              <CardHeader>
                <CardTitle>Schnellaktionen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => keiStream.connect()}
                    disabled={keiStream.connectionState === ConnectionState.CONNECTED}
                    className="w-full"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Verbinden
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => keiStream.disconnect()}
                    disabled={keiStream.connectionState === ConnectionState.DISCONNECTED}
                    className="w-full"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Trennen
                  </Button>
                </div>
                
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Aktuelle Session</h4>
                  <div className="space-y-1 text-sm">
                    <div>Session ID: <code className="bg-gray-100 px-1 rounded">{config.sessionId}</code></div>
                    <div>Tenant ID: <code className="bg-gray-100 px-1 rounded">{config.tenantId || 'Nicht gesetzt'}</code></div>
                    <div>Scopes: {config.scopes.map(scope => (
                      <Badge key={scope} variant="outline" className="ml-1 text-xs">{scope}</Badge>
                    ))}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Streams-Tab */}
        <TabsContent value="streams" className="space-y-6">
          {keiStream.connectionState === ConnectionState.CONNECTED ? (
            <div className="space-y-6">
              {/* Stream-Auswahl */}
              <Card>
                <CardHeader>
                  <CardTitle>Stream-Visualisierung</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1">
                      <Label htmlFor="stream-select">Stream ID</Label>
                      <Input
                        id="stream-select"
                        value={testStreamId}
                        onChange={(e) => setTestStreamId(e.target.value)}
                        placeholder="Stream-ID eingeben..."
                      />
                    </div>
                    <Button onClick={() => setTestStreamId('test-stream-' + Date.now())}>
                      Neue Stream-ID
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Frame-Visualisierung */}
              <FrameVisualization
                streamId={testStreamId}
                config={config}
                maxFrames={50}
                autoScroll={true}
              />
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Keine Verbindung</h3>
                <p className="text-muted-foreground mb-4">
                  Stellen Sie eine Verbindung her, um Streams zu visualisieren.
                </p>
                <Button onClick={() => keiStream.connect()}>
                  <Play className="h-4 w-4 mr-2" />
                  Jetzt verbinden
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Testing-Tab */}
        <TabsContent value="testing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Frame-Testing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="test-stream-id">Stream ID</Label>
                  <Input
                    id="test-stream-id"
                    value={testStreamId}
                    onChange={(e) => setTestStreamId(e.target.value)}
                    placeholder="test-stream"
                  />
                </div>
                <div>
                  <Label>Frame-Typ</Label>
                  <select className="w-full p-2 border rounded-md">
                    <option value={FrameType.PARTIAL}>PARTIAL</option>
                    <option value={FrameType.FINAL}>FINAL</option>
                    <option value={FrameType.STATUS}>STATUS</option>
                    <option value={FrameType.TOOL_CALL}>TOOL_CALL</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="test-payload">Payload (JSON)</Label>
                <Textarea
                  id="test-payload"
                  value={testPayload}
                  onChange={(e) => setTestPayload(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={sendTestFrame}
                  disabled={keiStream.connectionState !== ConnectionState.CONNECTED}
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Test-Frame senden
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setTestPayload('{\n  "message": "Test-Nachricht",\n  "timestamp": "' + new Date().toISOString() + '"\n}')}
                >
                  Zurücksetzen
                </Button>
              </div>

              {keiStream.connectionState !== ConnectionState.CONNECTED && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="flex items-center gap-2 text-yellow-800">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">Verbindung erforderlich</span>
                  </div>
                  <p className="text-sm text-yellow-700 mt-1">
                    Stellen Sie eine Verbindung her, um Test-Frames zu senden.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Einstellungen-Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Verbindungseinstellungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="config-url">WebSocket-URL</Label>
                  <Input
                    id="config-url"
                    value={config.url}
                    onChange={(e) => updateConfig({ url: e.target.value })}
                    placeholder="ws://localhost:8000/stream/ws/session"
                  />
                </div>
                <div>
                  <Label htmlFor="config-session">Session ID</Label>
                  <Input
                    id="config-session"
                    value={config.sessionId}
                    onChange={(e) => updateConfig({ sessionId: e.target.value })}
                    placeholder="frontend-session"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="config-token">API Token (optional)</Label>
                  <Input
                    id="config-token"
                    type="password"
                    value={config.apiToken}
                    onChange={(e) => updateConfig({ apiToken: e.target.value })}
                    placeholder="API Token eingeben..."
                  />
                </div>
                <div>
                  <Label htmlFor="config-tenant">Tenant ID (optional)</Label>
                  <Input
                    id="config-tenant"
                    value={config.tenantId}
                    onChange={(e) => updateConfig({ tenantId: e.target.value })}
                    placeholder="tenant-id"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="config-scopes">Scopes (durch Leerzeichen getrennt)</Label>
                <Input
                  id="config-scopes"
                  value={config.scopes.join(' ')}
                  onChange={(e) => updateConfig({ scopes: e.target.value.split(' ').filter(Boolean) })}
                  placeholder="kei.stream.read kei.stream.write"
                />
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="font-medium">Konfiguration gespeichert</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Änderungen werden automatisch übernommen. Verbinden Sie sich erneut, um die neuen Einstellungen zu verwenden.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StreamDashboard;
