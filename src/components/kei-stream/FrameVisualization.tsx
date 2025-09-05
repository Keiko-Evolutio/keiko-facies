/**
 * KEI-Stream Frame-Visualisierung
 * 
 * Echtzeit-Visualisierung von KEI-Stream Frames mit interaktiver Timeline,
 * Frame-Details und Filteroptionen.
 * 
 * @version 1.0.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { FrameType, KEIStreamFrame } from '@/kei-stream/types';
import { useKEIStreamConnection } from '@/kei-stream/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Filter,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Eye,
  EyeOff
} from 'lucide-react';

interface FrameVisualizationProps {
  /** Stream-ID für die Visualisierung */
  streamId: string;
  /** KEI-Stream-Konfiguration */
  config?: {
    url?: string;
    sessionId?: string;
    apiToken?: string;
    tenantId?: string;
    scopes?: string[];
  };
  /** Maximale Anzahl anzuzeigender Frames */
  maxFrames?: number;
  /** Automatisches Scrollen zu neuen Frames */
  autoScroll?: boolean;
  /** Kompakte Darstellung */
  compact?: boolean;
}

/**
 * Frame-Typ-Konfiguration für Styling und Icons
 */
const FRAME_TYPE_CONFIG = {
  [FrameType.PARTIAL]: {
    icon: <MessageSquare className="h-4 w-4" />,
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    label: 'Partial',
  },
  [FrameType.FINAL]: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'bg-green-100 text-green-800 border-green-200',
    label: 'Final',
  },
  [FrameType.ERROR]: {
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'bg-red-100 text-red-800 border-red-200',
    label: 'Error',
  },
  [FrameType.STATUS]: {
    icon: <Clock className="h-4 w-4" />,
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    label: 'Status',
  },
  [FrameType.ACK]: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    label: 'ACK',
  },
  [FrameType.HEARTBEAT]: {
    icon: <Zap className="h-4 w-4" />,
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    label: 'Heartbeat',
  },
  [FrameType.TOOL_CALL]: {
    icon: <MessageSquare className="h-4 w-4" />,
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    label: 'Tool Call',
  },
  [FrameType.TOOL_RESULT]: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'bg-teal-100 text-teal-800 border-teal-200',
    label: 'Tool Result',
  },
} as const;

/**
 * Haupt-Visualisierungskomponente
 */
export const FrameVisualization: React.FC<FrameVisualizationProps> = ({
  streamId,
  config = {},
  maxFrames = 100,
  autoScroll = true,
  compact = false,
}) => {
  const keiStream = useKEIStreamConnection(streamId, config);
  
  // State für UI-Kontrollen
  const [isPaused, setIsPaused] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<KEIStreamFrame | null>(null);
  const [frameTypeFilter, setFrameTypeFilter] = useState<Set<FrameType>>(new Set());
  const [showPayload, setShowPayload] = useState(true);

  // Gefilterte und begrenzte Frames
  const displayFrames = useMemo(() => {
    let filtered = keiStream.frames;
    
    // Frame-Typ-Filter anwenden
    if (frameTypeFilter.size > 0) {
      filtered = filtered.filter(frame => 
        frameTypeFilter.has(frame.type as FrameType)
      );
    }
    
    // Auf maximale Anzahl begrenzen
    return filtered.slice(-maxFrames);
  }, [keiStream.frames, frameTypeFilter, maxFrames]);

  // Auto-Scroll zu neuen Frames
  useEffect(() => {
    if (autoScroll && !isPaused && displayFrames.length > 0) {
      const element = document.getElementById(`frame-${displayFrames.length - 1}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [displayFrames.length, autoScroll, isPaused]);

  // Frame-Typ-Filter umschalten
  const toggleFrameTypeFilter = (frameType: FrameType) => {
    setFrameTypeFilter(prev => {
      const newSet = new Set(prev);
      if (newSet.has(frameType)) {
        newSet.delete(frameType);
      } else {
        newSet.add(frameType);
      }
      return newSet;
    });
  };

  // Alle Filter zurücksetzen
  const clearFilters = () => {
    setFrameTypeFilter(new Set());
  };

  // Test-Frame senden
  const sendTestFrame = () => {
    keiStream.sendToStream(FrameType.PARTIAL, {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'Test-Frame von der Visualisierung',
    });
  };

  return (
    <div className="space-y-4">
      {/* Kontroll-Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span>Frame-Visualisierung: {streamId}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {displayFrames.length} / {keiStream.frames.length} Frames
              </Badge>
              <Button
                size="sm"
                variant={isPaused ? "default" : "outline"}
                onClick={() => setIsPaused(!isPaused)}
              >
                {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {isPaused ? 'Fortsetzen' : 'Pausieren'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter-Kontrollen */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Filter:</span>
            {Object.entries(FRAME_TYPE_CONFIG).map(([type, config]) => (
              <Button
                key={type}
                size="sm"
                variant={frameTypeFilter.has(type as FrameType) ? "default" : "outline"}
                onClick={() => toggleFrameTypeFilter(type as FrameType)}
                className="h-8"
              >
                {config.icon}
                <span className="ml-1">{config.label}</span>
              </Button>
            ))}
            {frameTypeFilter.size > 0 && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <RotateCcw className="h-4 w-4" />
                Zurücksetzen
              </Button>
            )}
          </div>

          {/* Aktions-Buttons */}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={sendTestFrame}>
              Test-Frame senden
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPayload(!showPayload)}
            >
              {showPayload ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              Payload {showPayload ? 'verbergen' : 'anzeigen'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Frame-Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Frame-Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {displayFrames.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Keine Frames vorhanden
                {frameTypeFilter.size > 0 && (
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={clearFilters}>
                      Filter zurücksetzen
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              displayFrames.map((frame, index) => (
                <FrameItem
                  key={`${frame.id || index}-${frame.ts || Date.now()}`}
                  frame={frame}
                  index={index}
                  isSelected={selectedFrame?.id === frame.id}
                  onSelect={() => setSelectedFrame(frame)}
                  showPayload={showPayload}
                  compact={compact}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Frame-Details */}
      {selectedFrame && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              Frame-Details
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedFrame(null)}
              >
                Schließen
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FrameDetails frame={selectedFrame} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

/**
 * Einzelner Frame-Eintrag in der Timeline
 */
interface FrameItemProps {
  frame: KEIStreamFrame;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  showPayload: boolean;
  compact: boolean;
}

const FrameItem: React.FC<FrameItemProps> = ({
  frame,
  index,
  isSelected,
  onSelect,
  showPayload,
  compact,
}) => {
  const frameConfig = FRAME_TYPE_CONFIG[frame.type as FrameType] || {
    icon: <MessageSquare className="h-4 w-4" />,
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    label: frame.type,
  };

  const timestamp = frame.ts ? new Date(frame.ts).toLocaleTimeString() : 'Unbekannt';

  return (
    <div
      id={`frame-${index}`}
      className={`p-3 border rounded-md cursor-pointer transition-colors ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge className={frameConfig.color}>
            {frameConfig.icon}
            <span className="ml-1">{frameConfig.label}</span>
          </Badge>
          {frame.seq !== undefined && (
            <Badge variant="outline">Seq: {frame.seq}</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{timestamp}</span>
      </div>

      {!compact && showPayload && frame.payload && (
        <div className="mt-2">
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
            {JSON.stringify(frame.payload, null, 2)}
          </pre>
        </div>
      )}

      {frame.error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
          <div className="text-sm font-medium text-red-800">
            {frame.error.code}: {frame.error.message}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Detaillierte Frame-Ansicht
 */
interface FrameDetailsProps {
  frame: KEIStreamFrame;
}

const FrameDetails: React.FC<FrameDetailsProps> = ({ frame }) => {
  return (
    <div className="space-y-4">
      {/* Frame-Metadaten */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Typ</label>
          <div className="text-sm">{frame.type}</div>
        </div>
        <div>
          <label className="text-sm font-medium">Stream ID</label>
          <div className="text-sm">{frame.stream_id}</div>
        </div>
        <div>
          <label className="text-sm font-medium">Sequenz</label>
          <div className="text-sm">{frame.seq || 'Nicht gesetzt'}</div>
        </div>
        <div>
          <label className="text-sm font-medium">Zeitstempel</label>
          <div className="text-sm">
            {frame.ts ? new Date(frame.ts).toLocaleString() : 'Nicht gesetzt'}
          </div>
        </div>
      </div>

      {/* Frame-ID und Korrelations-ID */}
      {(frame.id || frame.corr_id) && (
        <div className="grid grid-cols-2 gap-4">
          {frame.id && (
            <div>
              <label className="text-sm font-medium">Frame ID</label>
              <div className="text-sm font-mono">{frame.id}</div>
            </div>
          )}
          {frame.corr_id && (
            <div>
              <label className="text-sm font-medium">Korrelations-ID</label>
              <div className="text-sm font-mono">{frame.corr_id}</div>
            </div>
          )}
        </div>
      )}

      {/* Headers */}
      {frame.headers && Object.keys(frame.headers).length > 0 && (
        <div>
          <label className="text-sm font-medium">Headers</label>
          <Textarea
            value={JSON.stringify(frame.headers, null, 2)}
            readOnly
            className="mt-1 font-mono text-xs"
            rows={3}
          />
        </div>
      )}

      {/* Payload */}
      {frame.payload && (
        <div>
          <label className="text-sm font-medium">Payload</label>
          <Textarea
            value={JSON.stringify(frame.payload, null, 2)}
            readOnly
            className="mt-1 font-mono text-xs"
            rows={8}
          />
        </div>
      )}

      {/* ACK-Informationen */}
      {frame.ack && (
        <div>
          <label className="text-sm font-medium">ACK-Informationen</label>
          <Textarea
            value={JSON.stringify(frame.ack, null, 2)}
            readOnly
            className="mt-1 font-mono text-xs"
            rows={3}
          />
        </div>
      )}

      {/* Fehler-Informationen */}
      {frame.error && (
        <div>
          <label className="text-sm font-medium">Fehler-Informationen</label>
          <div className="mt-1 p-3 bg-red-50 border border-red-200 rounded">
            <div className="font-medium text-red-800">
              {frame.error.code}: {frame.error.message}
            </div>
            {frame.error.details && (
              <pre className="mt-2 text-xs text-red-700">
                {JSON.stringify(frame.error.details, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FrameVisualization;
