/**
 * KEI-Stream OpenTelemetry Tracing-Integration
 * 
 * Browser-optimierte OpenTelemetry-Integration für KEI-Stream mit:
 * - W3C Trace Context Propagation (traceparent/tracestate)
 * - Automatische Span-Erstellung für KEI-Stream-Operationen
 * - Browser-kompatible OpenTelemetry-APIs
 * - Fallback-Mechanismen für Umgebungen ohne OpenTelemetry
 * 
 * @version 1.0.0
 */

import { HeadersDict, KEIStreamFrame } from './types';

/**
 * Konfiguration für OpenTelemetry-Integration
 */
export interface TracingConfig {
  /** OpenTelemetry aktivieren */
  enabled: boolean;
  /** Service-Name für Tracing */
  serviceName: string;
  /** Trace-Sampling-Rate (0.0 - 1.0) */
  samplingRate: number;
  /** Debug-Modus für Tracing */
  debug: boolean;
}

/**
 * Standard-Tracing-Konfiguration
 */
export const DEFAULT_TRACING_CONFIG: TracingConfig = {
  enabled: true,
  serviceName: 'kei-stream-frontend',
  samplingRate: 0.1,
  debug: false,
};

/**
 * OpenTelemetry-APIs (lazy loaded für Browser-Kompatibilität)
 */
let otelApi: any = null;
let otelPropagator: any = null;
let otelTracer: any = null;

/**
 * Prüft ob OpenTelemetry verfügbar ist
 */
export function isOpenTelemetryAvailable(): boolean {
  try {
    // Versuche OpenTelemetry-APIs zu laden
    if (typeof window !== 'undefined') {
      // Browser-Umgebung
      return !!(window as any).opentelemetry;
    } else {
      // Node.js-Umgebung (für Tests)
      require('@opentelemetry/api');
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Initialisiert OpenTelemetry für KEI-Stream
 */
export async function initializeTracing(config: Partial<TracingConfig> = {}): Promise<boolean> {
  const finalConfig = { ...DEFAULT_TRACING_CONFIG, ...config };
  
  if (!finalConfig.enabled || !isOpenTelemetryAvailable()) {
    console.debug('🔍 OpenTelemetry nicht verfügbar oder deaktiviert');
    return false;
  }

  try {
    if (typeof window !== 'undefined') {
      // Browser-Umgebung
      otelApi = (window as any).opentelemetry;
    } else {
      // Node.js-Umgebung
      otelApi = require('@opentelemetry/api');
    }

    if (otelApi) {
      otelPropagator = otelApi.propagation;
      otelTracer = otelApi.trace.getTracer(finalConfig.serviceName);
      
      console.debug('✅ OpenTelemetry für KEI-Stream initialisiert');
      return true;
    }
  } catch (error) {
    console.warn('⚠️ Fehler beim Initialisieren von OpenTelemetry:', error);
  }

  return false;
}

/**
 * Injiziert W3C Trace Context in Headers
 * 
 * Fügt traceparent und optional tracestate Headers hinzu,
 * kompatibel mit Backend OpenTelemetry-Implementation.
 */
export function injectTraceHeaders(headers: HeadersDict = {}): HeadersDict {
  if (!otelApi || !otelPropagator) {
    return headers;
  }

  try {
    const activeContext = otelApi.context.active();
    const span = otelApi.trace.getActiveSpan(activeContext);
    
    if (span) {
      const spanContext = span.spanContext();
      
      if (spanContext.isValid()) {
        // W3C traceparent Header erstellen
        const traceId = spanContext.traceId;
        const spanId = spanContext.spanId;
        const traceFlags = spanContext.traceFlags || 0;
        
        headers.traceparent = `00-${traceId}-${spanId}-${traceFlags.toString(16).padStart(2, '0')}`;
        
        // Optional: tracestate Header hinzufügen
        if (spanContext.traceState) {
          headers.tracestate = spanContext.traceState.serialize();
        }
        
        console.debug('🔍 Trace-Headers injiziert:', {
          traceparent: headers.traceparent,
          tracestate: headers.tracestate,
        });
      }
    }
  } catch (error) {
    console.warn('⚠️ Fehler beim Injizieren der Trace-Headers:', error);
  }

  return headers;
}

/**
 * Extrahiert Trace Context aus Headers
 */
export function extractTraceHeaders(headers: HeadersDict): any {
  if (!otelApi || !otelPropagator) {
    return otelApi?.context.active() || null;
  }

  try {
    const carrier = {
      get: (key: string) => headers[key.toLowerCase()],
      keys: () => Object.keys(headers),
    };

    return otelPropagator.extract(otelApi.context.active(), carrier);
  } catch (error) {
    console.warn('⚠️ Fehler beim Extrahieren der Trace-Headers:', error);
    return otelApi?.context.active() || null;
  }
}

/**
 * Erstellt Span für KEI-Stream-Operation
 */
export function createStreamSpan(
  operationName: string,
  streamId: string,
  attributes: Record<string, any> = {}
): any {
  if (!otelTracer) {
    return null;
  }

  try {
    const span = otelTracer.startSpan(operationName, {
      attributes: {
        'kei.stream.id': streamId,
        'kei.stream.operation': operationName,
        'component': 'kei-stream-frontend',
        ...attributes,
      },
    });

    return span;
  } catch (error) {
    console.warn('⚠️ Fehler beim Erstellen des Spans:', error);
    return null;
  }
}

/**
 * Fügt Attribute zu aktivem Span hinzu
 */
export function addSpanAttributes(attributes: Record<string, any>): void {
  if (!otelApi) return;

  try {
    const span = otelApi.trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  } catch (error) {
    console.warn('⚠️ Fehler beim Hinzufügen von Span-Attributen:', error);
  }
}

/**
 * Markiert Span als Fehler
 */
export function recordSpanError(error: Error, span?: any): void {
  if (!otelApi) return;

  try {
    const activeSpan = span || otelApi.trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.recordException(error);
      activeSpan.setStatus({
        code: otelApi.SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  } catch (err) {
    console.warn('⚠️ Fehler beim Aufzeichnen des Span-Fehlers:', err);
  }
}

/**
 * Beendet Span
 */
export function endSpan(span: any): void {
  if (!span) return;

  try {
    span.end();
  } catch (error) {
    console.warn('⚠️ Fehler beim Beenden des Spans:', error);
  }
}

/**
 * Wrapper für KEI-Stream-Operationen mit automatischem Tracing
 */
export function traceStreamOperation<T>(
  operationName: string,
  streamId: string,
  operation: () => T | Promise<T>,
  attributes: Record<string, any> = {}
): T | Promise<T> {
  const span = createStreamSpan(operationName, streamId, attributes);
  
  if (!span) {
    // Fallback ohne Tracing
    return operation();
  }

  try {
    const result = operation();
    
    if (result instanceof Promise) {
      return result
        .then((value) => {
          endSpan(span);
          return value;
        })
        .catch((error) => {
          recordSpanError(error, span);
          endSpan(span);
          throw error;
        });
    } else {
      endSpan(span);
      return result;
    }
  } catch (error) {
    recordSpanError(error as Error, span);
    endSpan(span);
    throw error;
  }
}

/**
 * Instrumentiert KEI-Stream Frame mit Tracing-Informationen
 */
export function instrumentFrame(frame: KEIStreamFrame, operationName: string): KEIStreamFrame {
  const instrumentedFrame = { ...frame };
  
  // Trace-Headers in Frame-Headers injizieren
  instrumentedFrame.headers = injectTraceHeaders(instrumentedFrame.headers || {});
  
  // Span für Frame-Operation erstellen
  const span = createStreamSpan(operationName, frame.stream_id, {
    'kei.stream.frame.type': frame.type,
    'kei.stream.frame.seq': frame.seq,
    'kei.stream.frame.id': frame.id,
  });
  
  if (span) {
    // Span-Kontext in Frame speichern (für spätere Verwendung)
    instrumentedFrame.headers = instrumentedFrame.headers || {};
    instrumentedFrame.headers['x-span-id'] = span.spanContext().spanId;
  }
  
  return instrumentedFrame;
}

/**
 * Hilfsfunktion für Debug-Ausgaben
 */
export function debugTrace(message: string, data?: any): void {
  if (DEFAULT_TRACING_CONFIG.debug) {
    console.debug(`🔍 [KEI-Stream Tracing] ${message}`, data);
  }
}
