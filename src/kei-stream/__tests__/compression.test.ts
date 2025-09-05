/**
 * Unit-Tests für KEI-Stream Compression-Policies
 * 
 * Testet die vollständige Compression-Funktionalität einschließlich:
 * - Compression-Profile-Auflösung
 * - Frame-Compression und Decompression
 * - Browser-kompatible Compression-APIs
 * - Tenant/API-Key-spezifische Konfiguration
 * 
 * @version 1.0.0
 */

import { 
  CompressionManager, 
  CompressionProfile,
  DEFAULT_COMPRESSION_PROFILE,
  getCompressionManager,
  createCompressionManager 
} from '../compression';
import { KEIStreamFrame, FrameType } from '../types';

// Mock CompressionStream für Tests (falls nicht verfügbar)
if (typeof CompressionStream === 'undefined') {
  (global as any).CompressionStream = class MockCompressionStream {
    readable: ReadableStream;
    writable: WritableStream;

    constructor(format: string) {
      const chunks: Uint8Array[] = [];
      
      this.writable = new WritableStream({
        write(chunk: Uint8Array) {
          chunks.push(chunk);
        },
        close() {
          // Simuliere Compression durch Verkleinerung
          const compressed = new Uint8Array(Math.floor(chunk.length * 0.7));
          chunks.push(compressed);
        }
      });

      this.readable = new ReadableStream({
        start(controller) {
          setTimeout(() => {
            chunks.forEach(chunk => controller.enqueue(chunk));
            controller.close();
          }, 10);
        }
      });
    }
  };

  (global as any).DecompressionStream = class MockDecompressionStream {
    readable: ReadableStream;
    writable: WritableStream;

    constructor(format: string) {
      const chunks: Uint8Array[] = [];
      
      this.writable = new WritableStream({
        write(chunk: Uint8Array) {
          chunks.push(chunk);
        }
      });

      this.readable = new ReadableStream({
        start(controller) {
          setTimeout(() => {
            // Simuliere Decompression durch Vergrößerung
            const decompressed = new TextEncoder().encode('{"decompressed": true}');
            controller.enqueue(decompressed);
            controller.close();
          }, 10);
        }
      });
    }
  };
}

describe('CompressionManager', () => {
  let manager: CompressionManager;

  beforeEach(() => {
    manager = new CompressionManager({
      default: DEFAULT_COMPRESSION_PROFILE,
      tenants: {
        'tenant-1': {
          compressionLevel: 8,
          compressionThreshold: 512,
        },
      },
      apiKeys: {
        'api-key-1': {
          compressionLevel: 9,
          compressionThreshold: 256,
        },
      },
    });
  });

  describe('Compression-Profile-Auflösung', () => {
    test('sollte Standard-Profil verwenden', () => {
      const profile = manager.resolveProfile();
      
      expect(profile).toEqual(DEFAULT_COMPRESSION_PROFILE);
    });

    test('sollte Tenant-spezifisches Profil anwenden', () => {
      const profile = manager.resolveProfile('tenant-1');
      
      expect(profile.compressionLevel).toBe(8);
      expect(profile.compressionThreshold).toBe(512);
      expect(profile.wsPermessageDeflate).toBe(DEFAULT_COMPRESSION_PROFILE.wsPermessageDeflate);
    });

    test('sollte API-Key-spezifisches Profil bevorzugen', () => {
      const profile = manager.resolveProfile('tenant-1', 'api-key-1');
      
      // API-Key-Einstellungen sollten Tenant-Einstellungen überschreiben
      expect(profile.compressionLevel).toBe(9);
      expect(profile.compressionThreshold).toBe(256);
    });

    test('sollte unbekannte Tenant/API-Key ignorieren', () => {
      const profile = manager.resolveProfile('unknown-tenant', 'unknown-key');
      
      expect(profile).toEqual(DEFAULT_COMPRESSION_PROFILE);
    });
  });

  describe('Frame-Compression-Entscheidung', () => {
    test('sollte große Frames komprimieren', () => {
      const frame: KEIStreamFrame = {
        type: FrameType.PARTIAL,
        stream_id: 'test-stream',
        payload: {
          data: 'x'.repeat(2000), // 2KB Payload
        },
      };

      const profile = manager.resolveProfile();
      const shouldCompress = manager.shouldCompressFrame(frame, profile);
      
      expect(shouldCompress).toBe(true);
    });

    test('sollte kleine Frames nicht komprimieren', () => {
      const frame: KEIStreamFrame = {
        type: FrameType.STATUS,
        stream_id: 'test-stream',
        payload: {
          status: 'ok',
        },
      };

      const profile = manager.resolveProfile();
      const shouldCompress = manager.shouldCompressFrame(frame, profile);
      
      expect(shouldCompress).toBe(false);
    });

    test('sollte Frames ohne Payload nicht komprimieren', () => {
      const frame: KEIStreamFrame = {
        type: FrameType.HEARTBEAT,
        stream_id: 'test-stream',
      };

      const profile = manager.resolveProfile();
      const shouldCompress = manager.shouldCompressFrame(frame, profile);
      
      expect(shouldCompress).toBe(false);
    });

    test('sollte Compression-Threshold respektieren', () => {
      const smallFrame: KEIStreamFrame = {
        type: FrameType.PARTIAL,
        stream_id: 'test-stream',
        payload: {
          data: 'x'.repeat(500), // 500 Bytes
        },
      };

      const profile = manager.resolveProfile('tenant-1'); // Threshold: 512
      const shouldCompress = manager.shouldCompressFrame(smallFrame, profile);
      
      expect(shouldCompress).toBe(false);
    });

    test('sollte Max-Payload-Size respektieren', () => {
      const hugeFrame: KEIStreamFrame = {
        type: FrameType.PARTIAL,
        stream_id: 'test-stream',
        payload: {
          data: 'x'.repeat(2 * 1024 * 1024), // 2MB Payload
        },
      };

      const profile = manager.resolveProfile();
      const shouldCompress = manager.shouldCompressFrame(hugeFrame, profile);
      
      expect(shouldCompress).toBe(false); // Über maxPayloadSize
    });
  });

  describe('Frame-Compression', () => {
    test('sollte Frame erfolgreich komprimieren', async () => {
      const originalFrame: KEIStreamFrame = {
        type: FrameType.PARTIAL,
        stream_id: 'test-stream',
        payload: {
          data: 'x'.repeat(2000),
          metadata: { important: true },
        },
        headers: {
          'x-original': 'header',
        },
      };

      const compressedFrame = await manager.compressFrame(originalFrame);
      
      expect(compressedFrame.binary_ref).toBeDefined();
      expect(compressedFrame.payload).toBeNull();
      expect(compressedFrame.headers?.['x-compression']).toBe('gzip');
      expect(compressedFrame.headers?.['x-original-size']).toBeDefined();
      expect(compressedFrame.headers?.['x-compressed-size']).toBeDefined();
      expect(compressedFrame.headers?.['x-original']).toBe('header'); // Ursprüngliche Headers erhalten
    });

    test('sollte kleine Frames unverändert lassen', async () => {
      const smallFrame: KEIStreamFrame = {
        type: FrameType.STATUS,
        stream_id: 'test-stream',
        payload: {
          status: 'ok',
        },
      };

      const result = await manager.compressFrame(smallFrame);
      
      expect(result).toBe(smallFrame); // Sollte dasselbe Objekt sein
      expect(result.binary_ref).toBeUndefined();
      expect(result.headers?.['x-compression']).toBeUndefined();
    });
  });

  describe('Frame-Decompression', () => {
    test('sollte komprimierte Frames dekomprimieren', async () => {
      const compressedFrame: KEIStreamFrame = {
        type: FrameType.PARTIAL,
        stream_id: 'test-stream',
        binary_ref: 'mock-compressed-data',
        payload: null,
        headers: {
          'x-compression': 'gzip',
          'x-original-size': '100',
          'x-compressed-size': '70',
          'x-other': 'header',
        },
      };

      const decompressedFrame = await manager.decompressFrame(compressedFrame);
      
      expect(decompressedFrame.payload).toBeDefined();
      expect(decompressedFrame.binary_ref).toBeNull();
      expect(decompressedFrame.headers?.['x-compression']).toBeUndefined();
      expect(decompressedFrame.headers?.['x-original-size']).toBeUndefined();
      expect(decompressedFrame.headers?.['x-compressed-size']).toBeUndefined();
      expect(decompressedFrame.headers?.['x-other']).toBe('header'); // Andere Headers erhalten
    });

    test('sollte unkomprimierte Frames unverändert lassen', async () => {
      const normalFrame: KEIStreamFrame = {
        type: FrameType.STATUS,
        stream_id: 'test-stream',
        payload: {
          status: 'ok',
        },
      };

      const result = await manager.decompressFrame(normalFrame);
      
      expect(result).toBe(normalFrame);
    });
  });

  describe('WebSocket-Compression-Konfiguration', () => {
    test('sollte permessage-deflate Extension konfigurieren', () => {
      const profile: CompressionProfile = {
        ...DEFAULT_COMPRESSION_PROFILE,
        wsPermessageDeflate: true,
      };

      const extensions = manager.configureWebSocketCompression(profile);
      
      expect(extensions).toHaveLength(1);
      expect(extensions[0]).toContain('permessage-deflate');
      expect(extensions[0]).toContain('server_no_context_takeover');
      expect(extensions[0]).toContain('client_no_context_takeover');
    });

    test('sollte keine Extensions bei deaktivierter Compression zurückgeben', () => {
      const profile: CompressionProfile = {
        ...DEFAULT_COMPRESSION_PROFILE,
        wsPermessageDeflate: false,
      };

      const extensions = manager.configureWebSocketCompression(profile);
      
      expect(extensions).toHaveLength(0);
    });
  });

  describe('Compression-Statistiken', () => {
    test('sollte Compression-Stats zurückgeben', () => {
      const stats = manager.getCompressionStats();
      
      expect(stats.supported).toBe(true); // Mock ist verfügbar
      expect(stats.profile).toEqual(DEFAULT_COMPRESSION_PROFILE);
      expect(stats.framesCompressed).toBeDefined();
      expect(stats.totalSavings).toBeDefined();
    });
  });
});

describe('Factory-Funktionen', () => {
  describe('getCompressionManager', () => {
    test('sollte globale Instanz zurückgeben', () => {
      const manager1 = getCompressionManager();
      const manager2 = getCompressionManager();
      
      expect(manager1).toBe(manager2);
    });

    test('sollte neue Instanz mit Konfiguration erstellen', () => {
      const customConfig = {
        default: {
          ...DEFAULT_COMPRESSION_PROFILE,
          compressionLevel: 9,
        },
      };

      const manager1 = getCompressionManager();
      const manager2 = getCompressionManager(customConfig);
      
      expect(manager1).not.toBe(manager2);
    });
  });

  describe('createCompressionManager', () => {
    test('sollte Manager mit Standard-Konfiguration erstellen', () => {
      const manager = createCompressionManager();
      const profile = manager.resolveProfile();
      
      expect(profile).toEqual(DEFAULT_COMPRESSION_PROFILE);
    });

    test('sollte Manager mit Tenant-Konfiguration erstellen', () => {
      const manager = createCompressionManager('test-tenant');
      const profile = manager.resolveProfile('test-tenant');
      
      expect(profile.compressionLevel).toBe(8);
      expect(profile.compressionThreshold).toBe(512);
    });

    test('sollte Manager mit API-Key-Konfiguration erstellen', () => {
      const manager = createCompressionManager('test-tenant', 'test-api-key');
      const profile = manager.resolveProfile('test-tenant', 'test-api-key');
      
      expect(profile.compressionLevel).toBe(9);
      expect(profile.compressionThreshold).toBe(256);
    });
  });
});

describe('Compression Integration', () => {
  test('sollte mit Backend-kompatible Compression verwenden', async () => {
    const manager = createCompressionManager();
    
    // Backend-kompatibles Frame
    const frame: KEIStreamFrame = {
      id: 'frame-123',
      type: FrameType.TOOL_RESULT,
      stream_id: 'integration-stream',
      seq: 42,
      ts: '2024-01-01T12:00:00.000Z',
      headers: {
        'traceparent': '00-1234567890abcdef-fedcba0987654321-01',
      },
      payload: {
        result: 'x'.repeat(2000), // Große Payload für Compression
        metadata: {
          execution_time: 1.5,
          memory_usage: 1024,
        },
      },
    };

    const compressed = await manager.compressFrame(frame);
    expect(compressed.binary_ref).toBeDefined();
    expect(compressed.headers?.['x-compression']).toBe('gzip');

    const decompressed = await manager.decompressFrame(compressed);
    expect(decompressed.payload).toBeDefined();
    expect(decompressed.binary_ref).toBeNull();
  });
});
