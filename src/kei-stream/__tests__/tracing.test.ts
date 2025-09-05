/**
 * Unit-Tests für KEI-Stream OpenTelemetry Tracing-Integration
 * 
 * Testet die vollständige Tracing-Funktionalität einschließlich:
 * - W3C Trace Context Propagation
 * - OpenTelemetry-Integration
 * - Span-Management und Instrumentierung
 * - Browser-kompatible Tracing-APIs
 * 
 * @version 1.0.0
 */

import {
  initializeTracing,
  isOpenTelemetryAvailable,
  injectTraceHeaders,
  extractTraceHeaders,
  createStreamSpan,
  addSpanAttributes,
  recordSpanError,
  endSpan,
  traceStreamOperation,
  instrumentFrame,
  debugTrace,
  DEFAULT_TRACING_CONFIG,
} from '../tracing';
import { KEIStreamFrame, FrameType } from '../types';

// Mock OpenTelemetry für Tests
const mockSpan = {
  spanContext: () => ({
    traceId: '1234567890abcdef1234567890abcdef',
    spanId: 'fedcba0987654321',
    traceFlags: 1,
    isValid: () => true,
    traceState: {
      serialize: () => 'key1=value1,key2=value2',
    },
  }),
  setAttributes: jest.fn(),
  recordException: jest.fn(),
  setStatus: jest.fn(),
  end: jest.fn(),
};

const mockTracer = {
  startSpan: jest.fn(() => mockSpan),
};

const mockContext = {
  active: jest.fn(() => ({})),
};

const mockPropagation = {
  extract: jest.fn(() => ({})),
};

const mockTrace = {
  getActiveSpan: jest.fn(() => mockSpan),
  getTracer: jest.fn(() => mockTracer),
};

const mockOtelApi = {
  trace: mockTrace,
  context: mockContext,
  propagation: mockPropagation,
  SpanStatusCode: {
    ERROR: 2,
  },
};

// OpenTelemetry global mocken
(global as any).opentelemetry = mockOtelApi;

describe('OpenTelemetry Verfügbarkeit', () => {
  test('sollte OpenTelemetry-Verfügbarkeit korrekt erkennen', () => {
    expect(isOpenTelemetryAvailable()).toBe(true);
  });

  test('sollte false zurückgeben wenn OpenTelemetry nicht verfügbar', () => {
    const originalOtel = (global as any).opentelemetry;
    delete (global as any).opentelemetry;
    
    expect(isOpenTelemetryAvailable()).toBe(false);
    
    // Wiederherstellen
    (global as any).opentelemetry = originalOtel;
  });
});

describe('Tracing-Initialisierung', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sollte erfolgreich initialisieren', async () => {
    const result = await initializeTracing({
      enabled: true,
      serviceName: 'test-service',
      samplingRate: 0.5,
      debug: true,
    });

    expect(result).toBe(true);
  });

  test('sollte false zurückgeben wenn deaktiviert', async () => {
    const result = await initializeTracing({
      enabled: false,
    });

    expect(result).toBe(false);
  });

  test('sollte Standard-Konfiguration verwenden', async () => {
    const result = await initializeTracing();

    expect(result).toBe(true);
  });
});

describe('Trace-Header-Injection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock für aktiven Span
    mockTrace.getActiveSpan.mockReturnValue(mockSpan);
  });

  test('sollte W3C traceparent Header injizieren', () => {
    const headers = injectTraceHeaders({});

    expect(headers.traceparent).toBe(
      '00-1234567890abcdef1234567890abcdef-fedcba0987654321-01'
    );
  });

  test('sollte tracestate Header injizieren', () => {
    const headers = injectTraceHeaders({});

    expect(headers.tracestate).toBe('key1=value1,key2=value2');
  });

  test('sollte bestehende Headers erhalten', () => {
    const existingHeaders = {
      'content-type': 'application/json',
      'x-custom': 'value',
    };

    const headers = injectTraceHeaders(existingHeaders);

    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-custom']).toBe('value');
    expect(headers.traceparent).toBeDefined();
  });

  test('sollte leere Headers zurückgeben wenn kein aktiver Span', () => {
    mockTrace.getActiveSpan.mockReturnValue(null);

    const headers = injectTraceHeaders({});

    expect(headers.traceparent).toBeUndefined();
    expect(headers.tracestate).toBeUndefined();
  });
});

describe('Trace-Header-Extraktion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sollte Trace-Context aus Headers extrahieren', () => {
    const headers = {
      traceparent: '00-1234567890abcdef1234567890abcdef-fedcba0987654321-01',
      tracestate: 'key1=value1',
    };

    const context = extractTraceHeaders(headers);

    expect(mockPropagation.extract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        get: expect.any(Function),
        keys: expect.any(Function),
      })
    );
  });

  test('sollte case-insensitive Header-Zugriff unterstützen', () => {
    const headers = {
      'TraceParent': '00-1234567890abcdef1234567890abcdef-fedcba0987654321-01',
      'TRACESTATE': 'key1=value1',
    };

    extractTraceHeaders(headers);

    expect(mockPropagation.extract).toHaveBeenCalled();
  });
});

describe('Span-Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sollte Stream-Span erstellen', () => {
    const span = createStreamSpan('test-operation', 'stream-123', {
      'custom.attribute': 'value',
    });

    expect(mockTracer.startSpan).toHaveBeenCalledWith('test-operation', {
      attributes: {
        'kei.stream.id': 'stream-123',
        'kei.stream.operation': 'test-operation',
        'component': 'kei-stream-frontend',
        'custom.attribute': 'value',
      },
    });

    expect(span).toBe(mockSpan);
  });

  test('sollte Attribute zu Span hinzufügen', () => {
    addSpanAttributes({
      'test.attribute': 'value',
      'test.number': 42,
    });

    expect(mockSpan.setAttributes).toHaveBeenCalledWith({
      'test.attribute': 'value',
      'test.number': 42,
    });
  });

  test('sollte Fehler in Span aufzeichnen', () => {
    const error = new Error('Test error');
    recordSpanError(error, mockSpan);

    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: 2, // ERROR
      message: 'Test error',
    });
  });

  test('sollte Span beenden', () => {
    endSpan(mockSpan);

    expect(mockSpan.end).toHaveBeenCalled();
  });
});

describe('Stream-Operation-Tracing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sollte synchrone Operation tracen', () => {
    const operation = jest.fn(() => 'result');
    
    const result = traceStreamOperation(
      'sync-operation',
      'stream-123',
      operation,
      { 'test.attr': 'value' }
    );

    expect(mockTracer.startSpan).toHaveBeenCalledWith('sync-operation', {
      attributes: {
        'kei.stream.id': 'stream-123',
        'kei.stream.operation': 'sync-operation',
        'component': 'kei-stream-frontend',
        'test.attr': 'value',
      },
    });

    expect(operation).toHaveBeenCalled();
    expect(result).toBe('result');
    expect(mockSpan.end).toHaveBeenCalled();
  });

  test('sollte asynchrone Operation tracen', async () => {
    const operation = jest.fn(async () => 'async-result');
    
    const result = await traceStreamOperation(
      'async-operation',
      'stream-123',
      operation
    );

    expect(operation).toHaveBeenCalled();
    expect(result).toBe('async-result');
    expect(mockSpan.end).toHaveBeenCalled();
  });

  test('sollte Fehler in asynchroner Operation behandeln', async () => {
    const error = new Error('Async error');
    const operation = jest.fn(async () => {
      throw error;
    });

    await expect(
      traceStreamOperation('failing-operation', 'stream-123', operation)
    ).rejects.toThrow('Async error');

    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(mockSpan.end).toHaveBeenCalled();
  });

  test('sollte ohne Tracing funktionieren wenn kein Span erstellt werden kann', () => {
    mockTracer.startSpan.mockReturnValue(null);
    
    const operation = jest.fn(() => 'fallback-result');
    const result = traceStreamOperation('operation', 'stream-123', operation);

    expect(result).toBe('fallback-result');
    expect(operation).toHaveBeenCalled();
  });
});

describe('Frame-Instrumentierung', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sollte Frame mit Tracing-Informationen instrumentieren', () => {
    const originalFrame: KEIStreamFrame = {
      type: FrameType.PARTIAL,
      stream_id: 'test-stream',
      seq: 42,
      payload: { data: 'test' },
    };

    const instrumentedFrame = instrumentFrame(originalFrame, 'send-frame');

    expect(instrumentedFrame.headers?.traceparent).toBeDefined();
    expect(instrumentedFrame.headers?.['x-span-id']).toBe('fedcba0987654321');
    
    expect(mockTracer.startSpan).toHaveBeenCalledWith('send-frame', {
      attributes: {
        'kei.stream.id': 'test-stream',
        'kei.stream.operation': 'send-frame',
        'component': 'kei-stream-frontend',
        'kei.stream.frame.type': FrameType.PARTIAL,
        'kei.stream.frame.seq': 42,
        'kei.stream.frame.id': undefined,
      },
    });
  });

  test('sollte bestehende Headers erhalten', () => {
    const originalFrame: KEIStreamFrame = {
      type: FrameType.STATUS,
      stream_id: 'test-stream',
      headers: {
        'x-custom': 'value',
        'content-type': 'application/json',
      },
    };

    const instrumentedFrame = instrumentFrame(originalFrame, 'status-frame');

    expect(instrumentedFrame.headers?.['x-custom']).toBe('value');
    expect(instrumentedFrame.headers?.['content-type']).toBe('application/json');
    expect(instrumentedFrame.headers?.traceparent).toBeDefined();
  });
});

describe('Debug-Tracing', () => {
  test('sollte Debug-Nachrichten ausgeben wenn aktiviert', () => {
    const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
    
    // Debug aktivieren
    (DEFAULT_TRACING_CONFIG as any).debug = true;
    
    debugTrace('Test message', { data: 'value' });

    expect(consoleSpy).toHaveBeenCalledWith(
      '🔍 [KEI-Stream Tracing] Test message',
      { data: 'value' }
    );

    consoleSpy.mockRestore();
    (DEFAULT_TRACING_CONFIG as any).debug = false;
  });

  test('sollte keine Debug-Nachrichten ausgeben wenn deaktiviert', () => {
    const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
    
    debugTrace('Test message');

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe('Tracing Integration', () => {
  test('sollte mit KEI-Stream-Client kompatibel sein', () => {
    const frame: KEIStreamFrame = {
      id: 'integration-frame',
      type: FrameType.TOOL_CALL,
      stream_id: 'integration-stream',
      seq: 1,
      ts: '2024-01-01T12:00:00.000Z',
      payload: {
        tool_name: 'test_tool',
        parameters: {},
      },
    };

    // Simuliere KEI-Stream-Client Nutzung
    const instrumentedFrame = instrumentFrame(frame, 'kei-stream.send.tool_call');

    expect(instrumentedFrame.headers?.traceparent).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/
    );

    expect(mockTracer.startSpan).toHaveBeenCalledWith(
      'kei-stream.send.tool_call',
      expect.objectContaining({
        attributes: expect.objectContaining({
          'kei.stream.id': 'integration-stream',
          'kei.stream.frame.type': FrameType.TOOL_CALL,
        }),
      })
    );
  });

  test('sollte Backend-kompatible Trace-Propagation verwenden', () => {
    const headers = injectTraceHeaders({});

    // W3C Trace Context Format prüfen
    expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);

    // Backend-Kompatibilität: traceparent sollte vom Backend verstanden werden
    const [version, traceId, spanId, flags] = headers.traceparent.split('-');
    expect(version).toBe('00');
    expect(traceId).toHaveLength(32);
    expect(spanId).toHaveLength(16);
    expect(flags).toMatch(/^[0-9a-f]{2}$/);
  });
});
