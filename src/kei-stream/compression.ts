/**
 * KEI-Stream Compression-Policies für Browser
 * 
 * Browser-optimierte Compression-Implementation für KEI-Stream mit:
 * - WebSocket permessage-deflate Extension-Unterstützung
 * - Payload-Compression für große Frames
 * - Konfigurierbare Compression-Profile
 * - Kompatibilität mit Backend Compression-Policies
 * 
 * @version 1.0.0
 */

import { KEIStreamFrame } from './types';

/**
 * Compression-Profil für KEI-Stream
 * 
 * Kompatibel mit Backend CompressionProfile aus compression_policies.py
 */
export interface CompressionProfile {
  /** WebSocket permessage-deflate aktivieren */
  wsPermessageDeflate: boolean;
  /** Payload-Compression aktivieren */
  payloadCompression: boolean;
  /** Compression-Level (1-9, höher = bessere Compression) */
  compressionLevel: number;
  /** Minimale Payload-Größe für Compression (Bytes) */
  compressionThreshold: number;
  /** Maximale Payload-Größe für Compression (Bytes) */
  maxPayloadSize: number;
}

/**
 * Standard-Compression-Konfiguration
 */
export const DEFAULT_COMPRESSION_PROFILE: CompressionProfile = {
  wsPermessageDeflate: true,
  payloadCompression: true,
  compressionLevel: 6,
  compressionThreshold: 1024, // 1KB
  maxPayloadSize: 1024 * 1024, // 1MB
};

/**
 * Compression-Konfiguration basierend auf Tenant/API-Key
 */
export interface CompressionConfig {
  /** Standard-Profil */
  default: CompressionProfile;
  /** Tenant-spezifische Profile */
  tenants?: Record<string, Partial<CompressionProfile>>;
  /** API-Key-spezifische Profile */
  apiKeys?: Record<string, Partial<CompressionProfile>>;
}

/**
 * Compression-Manager für KEI-Stream Frames
 * 
 * Verwaltet Compression-Policies und führt Payload-Compression durch.
 * Kompatibel mit Backend compression_policies.py Implementation.
 */
export class CompressionManager {
  private config: CompressionConfig;
  private compressionSupported: boolean;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = {
      default: DEFAULT_COMPRESSION_PROFILE,
      ...config,
    };
    
    this.compressionSupported = this.checkCompressionSupport();
  }

  /**
   * Prüft Browser-Unterstützung für Compression
   */
  private checkCompressionSupport(): boolean {
    try {
      // Prüfe CompressionStream API (moderne Browser)
      return typeof CompressionStream !== 'undefined' && 
             typeof DecompressionStream !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * Ermittelt Compression-Profil für Tenant/API-Key
   * 
   * Auflösungsreihenfolge (kompatibel mit Backend):
   * 1. API-Key-spezifisches Profil
   * 2. Tenant-spezifisches Profil  
   * 3. Standard-Profil
   */
  resolveProfile(tenantId?: string, apiKey?: string): CompressionProfile {
    let profile = { ...this.config.default };

    // Tenant-spezifische Einstellungen anwenden
    if (tenantId && this.config.tenants?.[tenantId]) {
      profile = { ...profile, ...this.config.tenants[tenantId] };
    }

    // API-Key-spezifische Einstellungen haben Vorrang
    if (apiKey && this.config.apiKeys?.[apiKey]) {
      profile = { ...profile, ...this.config.apiKeys[apiKey] };
    }

    return profile;
  }

  /**
   * Prüft ob Frame komprimiert werden sollte
   */
  shouldCompressFrame(frame: KEIStreamFrame, profile: CompressionProfile): boolean {
    if (!this.compressionSupported || !profile.payloadCompression) {
      return false;
    }

    // Nur Frames mit Payload komprimieren
    if (!frame.payload) {
      return false;
    }

    // Payload-Größe prüfen
    const payloadSize = this.estimatePayloadSize(frame.payload);
    
    return payloadSize >= profile.compressionThreshold && 
           payloadSize <= profile.maxPayloadSize;
  }

  /**
   * Schätzt Payload-Größe in Bytes
   */
  private estimatePayloadSize(payload: Record<string, any>): number {
    try {
      return new Blob([JSON.stringify(payload)]).size;
    } catch {
      // Fallback: grobe Schätzung
      return JSON.stringify(payload).length * 2;
    }
  }

  /**
   * Komprimiert KEI-Stream Frame
   */
  async compressFrame(
    frame: KEIStreamFrame, 
    tenantId?: string, 
    apiKey?: string
  ): Promise<KEIStreamFrame> {
    const profile = this.resolveProfile(tenantId, apiKey);
    
    if (!this.shouldCompressFrame(frame, profile)) {
      return frame;
    }

    try {
      const compressedFrame = { ...frame };
      
      if (frame.payload) {
        const payloadJson = JSON.stringify(frame.payload);
        const compressed = await this.compressPayload(payloadJson, profile);
        
        // Komprimierte Payload als binary_ref speichern
        compressedFrame.binary_ref = compressed;
        compressedFrame.payload = null;
        
        // Compression-Metadaten in Headers
        compressedFrame.headers = {
          ...compressedFrame.headers,
          'x-compression': 'gzip',
          'x-original-size': payloadJson.length.toString(),
          'x-compressed-size': compressed.length.toString(),
        };
      }
      
      return compressedFrame;
    } catch (error) {
      console.warn('⚠️ Fehler bei Frame-Compression:', error);
      return frame; // Fallback: unkomprimiertes Frame
    }
  }

  /**
   * Dekomprimiert KEI-Stream Frame
   */
  async decompressFrame(frame: KEIStreamFrame): Promise<KEIStreamFrame> {
    if (!frame.binary_ref || !frame.headers?.['x-compression']) {
      return frame;
    }

    try {
      const decompressedFrame = { ...frame };
      
      if (frame.headers['x-compression'] === 'gzip') {
        const decompressed = await this.decompressPayload(frame.binary_ref);
        decompressedFrame.payload = JSON.parse(decompressed);
        decompressedFrame.binary_ref = null;
        
        // Compression-Headers entfernen
        const { 'x-compression': _, 'x-original-size': __, 'x-compressed-size': ___, ...cleanHeaders } = frame.headers;
        decompressedFrame.headers = cleanHeaders;
      }
      
      return decompressedFrame;
    } catch (error) {
      console.error('❌ Fehler bei Frame-Decompression:', error);
      return frame; // Fallback: Frame unverändert
    }
  }

  /**
   * Komprimiert Payload-String mit gzip
   */
  private async compressPayload(payload: string, profile: CompressionProfile): Promise<string> {
    if (!this.compressionSupported) {
      throw new Error('Compression nicht unterstützt');
    }

    try {
      const stream = new CompressionStream('gzip');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      
      // Payload schreiben
      await writer.write(new TextEncoder().encode(payload));
      await writer.close();
      
      // Komprimierte Daten lesen
      const chunks: Uint8Array[] = [];
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }
      
      // Zu Base64 konvertieren
      const compressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }
      
      return btoa(String.fromCharCode(...compressed));
    } catch (error) {
      throw new Error(`Compression fehlgeschlagen: ${error}`);
    }
  }

  /**
   * Dekomprimiert Base64-kodierten gzip-String
   */
  private async decompressPayload(compressedBase64: string): Promise<string> {
    if (!this.compressionSupported) {
      throw new Error('Decompression nicht unterstützt');
    }

    try {
      // Base64 dekodieren
      const compressed = Uint8Array.from(atob(compressedBase64), c => c.charCodeAt(0));
      
      const stream = new DecompressionStream('gzip');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      
      // Komprimierte Daten schreiben
      await writer.write(compressed);
      await writer.close();
      
      // Dekomprimierte Daten lesen
      const chunks: Uint8Array[] = [];
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }
      
      // Zu String konvertieren
      const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
      }
      
      return new TextDecoder().decode(decompressed);
    } catch (error) {
      throw new Error(`Decompression fehlgeschlagen: ${error}`);
    }
  }

  /**
   * Konfiguriert WebSocket für permessage-deflate
   */
  configureWebSocketCompression(profile: CompressionProfile): string[] {
    const extensions: string[] = [];
    
    if (profile.wsPermessageDeflate) {
      // permessage-deflate Extension mit Parametern
      const params = [
        'server_no_context_takeover',
        'client_no_context_takeover',
        `server_max_window_bits=15`,
        `client_max_window_bits=15`,
      ];
      
      extensions.push(`permessage-deflate; ${params.join('; ')}`);
    }
    
    return extensions;
  }

  /**
   * Gibt Compression-Statistiken zurück
   */
  getCompressionStats(): {
    supported: boolean;
    profile: CompressionProfile;
    framesCompressed: number;
    totalSavings: number;
  } {
    return {
      supported: this.compressionSupported,
      profile: this.config.default,
      framesCompressed: 0, // TODO: Statistiken implementieren
      totalSavings: 0,
    };
  }
}

/**
 * Globale Compression-Manager-Instanz
 */
let globalCompressionManager: CompressionManager | null = null;

/**
 * Holt oder erstellt globalen Compression-Manager
 */
export function getCompressionManager(config?: Partial<CompressionConfig>): CompressionManager {
  if (!globalCompressionManager || config) {
    globalCompressionManager = new CompressionManager(config);
  }
  return globalCompressionManager;
}

/**
 * Factory-Funktion für Standard-Compression-Manager
 */
export function createCompressionManager(
  tenantId?: string,
  apiKey?: string
): CompressionManager {
  const config: CompressionConfig = {
    default: DEFAULT_COMPRESSION_PROFILE,
  };
  
  // Tenant-spezifische Konfiguration
  if (tenantId) {
    config.tenants = {
      [tenantId]: {
        compressionLevel: 8, // Höhere Compression für Tenants
        compressionThreshold: 512, // Niedrigere Schwelle
      },
    };
  }
  
  // API-Key-spezifische Konfiguration
  if (apiKey) {
    config.apiKeys = {
      [apiKey]: {
        compressionLevel: 9, // Maximale Compression für API-Keys
        compressionThreshold: 256,
      },
    };
  }
  
  return new CompressionManager(config);
}
