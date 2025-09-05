/**
 * Edge Cache Manager für AI-Modelle und Audio-Daten
 * 
 * Intelligentes Caching-System für häufig verwendete AI-Modelle,
 * Audio-Verarbeitungsresultate und Edge-Computing-Artefakte.
 * 
 * @version 1.0.0
 */

import type {
  EdgeAIModel,
  EdgePerformanceMetrics,
  EdgeEventMap
} from './types';

// =============================================================================
// Cache Entry Types
// =============================================================================

interface CacheEntry<T = any> {
  key: string;
  data: T;
  size: number;
  accessCount: number;
  lastAccessed: Date;
  created: Date;
  ttl: number; // Time to live in ms
  priority: number; // 0-10, höher = wichtiger
  metadata: Record<string, any>;
}

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
  hitRate: number;
  averageRetrievalTime: number;
}

// =============================================================================
// LRU Cache Implementation
// =============================================================================

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private maxEntries: number;
  private stats: CacheStats;

  constructor(maxSize: number = 100 * 1024 * 1024, maxEntries: number = 1000) { // 100MB default
    this.maxSize = maxSize;
    this.maxEntries = maxEntries;
    this.stats = {
      totalEntries: 0,
      totalSize: 0,
      hitCount: 0,
      missCount: 0,
      evictionCount: 0,
      hitRate: 0,
      averageRetrievalTime: 0
    };
  }

  get(key: string): T | null {
    const startTime = performance.now();
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.missCount++;
      this.updateHitRate();
      return null;
    }

    // TTL prüfen
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.totalSize -= entry.size;
      this.stats.totalEntries--;
      this.stats.missCount++;
      this.updateHitRate();
      return null;
    }

    // LRU: Entry als zuletzt verwendet markieren
    entry.lastAccessed = new Date();
    entry.accessCount++;
    
    // Entry an Ende der Map verschieben (neueste)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hitCount++;
    this.updateHitRate();
    
    const retrievalTime = performance.now() - startTime;
    this.updateAverageRetrievalTime(retrievalTime);

    return entry.data;
  }

  set(key: string, data: T, options: {
    ttl?: number;
    priority?: number;
    metadata?: Record<string, any>;
  } = {}): void {
    const size = this.calculateSize(data);
    const entry: CacheEntry<T> = {
      key,
      data,
      size,
      accessCount: 0,
      lastAccessed: new Date(),
      created: new Date(),
      ttl: options.ttl || 3600000, // 1 Stunde default
      priority: options.priority || 5,
      metadata: options.metadata || {}
    };

    // Bestehenden Entry entfernen falls vorhanden
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.stats.totalSize -= oldEntry.size;
      this.stats.totalEntries--;
    }

    // Platz schaffen falls nötig
    this.ensureCapacity(size);

    // Neuen Entry hinzufügen
    this.cache.set(key, entry);
    this.stats.totalSize += size;
    this.stats.totalEntries++;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.stats.totalSize -= entry.size;
    this.stats.totalEntries--;
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.stats.totalEntries = 0;
    this.stats.totalSize = 0;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.created.getTime() > entry.ttl;
  }

  private ensureCapacity(newEntrySize: number): void {
    // Abgelaufene Entries entfernen
    this.cleanupExpired();

    // Platz schaffen durch LRU-Eviction
    while (
      (this.stats.totalSize + newEntrySize > this.maxSize) ||
      (this.stats.totalEntries >= this.maxEntries)
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;

      const entry = this.cache.get(oldestKey)!;
      this.cache.delete(oldestKey);
      this.stats.totalSize -= entry.size;
      this.stats.totalEntries--;
      this.stats.evictionCount++;
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.created.getTime() > entry.ttl) {
        this.cache.delete(key);
        this.stats.totalSize -= entry.size;
        this.stats.totalEntries--;
      }
    }
  }

  private calculateSize(data: any): number {
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    } else if (data instanceof Float32Array || data instanceof Int32Array) {
      return data.byteLength;
    } else if (typeof data === 'string') {
      return data.length * 2; // UTF-16
    } else if (typeof data === 'object') {
      return JSON.stringify(data).length * 2;
    } else {
      return 64; // Default für primitive Typen
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hitCount + this.stats.missCount;
    this.stats.hitRate = total > 0 ? this.stats.hitCount / total : 0;
  }

  private updateAverageRetrievalTime(retrievalTime: number): void {
    const alpha = 0.1; // Exponential moving average factor
    this.stats.averageRetrievalTime = 
      this.stats.averageRetrievalTime * (1 - alpha) + retrievalTime * alpha;
  }
}

// =============================================================================
// Edge Cache Manager
// =============================================================================

export class EdgeCacheManager {
  private modelCache: LRUCache<EdgeAIModel>;
  private resultCache: LRUCache<ArrayBuffer>;
  private metadataCache: LRUCache<any>;
  private preloadQueue: Set<string> = new Set();
  private listeners: Map<string, Function[]> = new Map();

  constructor(options: {
    modelCacheSize?: number;
    resultCacheSize?: number;
    metadataCacheSize?: number;
    maxEntries?: number;
  } = {}) {
    this.modelCache = new LRUCache<EdgeAIModel>(
      options.modelCacheSize || 500 * 1024 * 1024, // 500MB für Modelle
      options.maxEntries || 100
    );
    
    this.resultCache = new LRUCache<ArrayBuffer>(
      options.resultCacheSize || 200 * 1024 * 1024, // 200MB für Ergebnisse
      options.maxEntries || 1000
    );
    
    this.metadataCache = new LRUCache<any>(
      options.metadataCacheSize || 10 * 1024 * 1024, // 10MB für Metadaten
      options.maxEntries || 5000
    );

    this.startMaintenanceLoop();
    console.log('[EdgeCacheManager] Initialisiert');
  }

  // =============================================================================
  // Model Caching
  // =============================================================================

  async cacheModel(modelId: string, model: EdgeAIModel, priority: number = 5): Promise<void> {
    const cacheKey = `model:${modelId}`;
    
    this.modelCache.set(cacheKey, model, {
      ttl: 24 * 60 * 60 * 1000, // 24 Stunden
      priority,
      metadata: {
        modelId,
        type: model.type,
        version: model.version,
        sizeInMB: model.sizeInMB
      }
    });

    this.emit('cache-hit', { modelId, retrievalTime: 0 });
    console.log(`[EdgeCacheManager] Modell gecacht: ${modelId} (${model.sizeInMB}MB)`);
  }

  getModel(modelId: string): EdgeAIModel | null {
    const cacheKey = `model:${modelId}`;
    const model = this.modelCache.get(cacheKey);
    
    if (model) {
      this.emit('cache-hit', { modelId, retrievalTime: this.modelCache.getStats().averageRetrievalTime });
    } else {
      this.emit('cache-miss', { modelId });
    }
    
    return model;
  }

  async preloadModel(modelId: string, modelUrl: string): Promise<void> {
    if (this.preloadQueue.has(modelId) || this.getModel(modelId)) {
      return; // Bereits geladen oder wird geladen
    }

    this.preloadQueue.add(modelId);

    try {
      // Modell-Metadaten laden
      const response = await fetch(`${modelUrl}/metadata.json`);
      const metadata = await response.json();
      
      const model: EdgeAIModel = {
        modelId,
        name: metadata.name,
        type: metadata.type,
        version: metadata.version,
        sizeInMB: metadata.sizeInMB,
        inputFormats: metadata.inputFormats,
        expectedLatency: metadata.expectedLatency,
        accuracy: metadata.accuracy,
        wasmCompatible: metadata.wasmCompatible,
        gpuAccelerated: metadata.gpuAccelerated
      };

      await this.cacheModel(modelId, model, 8); // Hohe Priorität für preloaded models
      
    } catch (error) {
      console.error(`[EdgeCacheManager] Fehler beim Preloading von ${modelId}:`, error);
    } finally {
      this.preloadQueue.delete(modelId);
    }
  }

  // =============================================================================
  // Result Caching
  // =============================================================================

  cacheResult(inputHash: string, result: ArrayBuffer, metadata: any = {}): void {
    const cacheKey = `result:${inputHash}`;
    
    this.resultCache.set(cacheKey, result, {
      ttl: 60 * 60 * 1000, // 1 Stunde
      priority: 3,
      metadata: {
        inputHash,
        resultSize: result.byteLength,
        ...metadata
      }
    });

    console.debug(`[EdgeCacheManager] Ergebnis gecacht: ${inputHash} (${result.byteLength} bytes)`);
  }

  getCachedResult(inputHash: string): ArrayBuffer | null {
    const cacheKey = `result:${inputHash}`;
    return this.resultCache.get(cacheKey);
  }

  // =============================================================================
  // Metadata Caching
  // =============================================================================

  cacheMetadata(key: string, metadata: any, ttl: number = 300000): void { // 5 Minuten default
    this.metadataCache.set(key, metadata, {
      ttl,
      priority: 2,
      metadata: { key, type: 'metadata' }
    });
  }

  getMetadata(key: string): any {
    return this.metadataCache.get(key);
  }

  // =============================================================================
  // Cache Management
  // =============================================================================

  getOverallStats(): {
    models: CacheStats;
    results: CacheStats;
    metadata: CacheStats;
    totalSize: number;
    overallHitRate: number;
  } {
    const modelStats = this.modelCache.getStats();
    const resultStats = this.resultCache.getStats();
    const metadataStats = this.metadataCache.getStats();

    const totalHits = modelStats.hitCount + resultStats.hitCount + metadataStats.hitCount;
    const totalMisses = modelStats.missCount + resultStats.missCount + metadataStats.missCount;
    const overallHitRate = (totalHits + totalMisses) > 0 ? totalHits / (totalHits + totalMisses) : 0;

    return {
      models: modelStats,
      results: resultStats,
      metadata: metadataStats,
      totalSize: modelStats.totalSize + resultStats.totalSize + metadataStats.totalSize,
      overallHitRate
    };
  }

  clearCache(type?: 'models' | 'results' | 'metadata'): void {
    if (!type || type === 'models') {
      this.modelCache.clear();
    }
    if (!type || type === 'results') {
      this.resultCache.clear();
    }
    if (!type || type === 'metadata') {
      this.metadataCache.clear();
    }

    console.log(`[EdgeCacheManager] Cache geleert: ${type || 'alle'}`);
  }

  // =============================================================================
  // Intelligent Prefetching
  // =============================================================================

  async prefetchPopularModels(modelIds: string[]): Promise<void> {
    const prefetchPromises = modelIds.map(async (modelId) => {
      if (!this.getModel(modelId)) {
        // Modell-URL aus Registry holen (vereinfacht)
        const modelUrl = `/models/${modelId}`;
        await this.preloadModel(modelId, modelUrl);
      }
    });

    await Promise.all(prefetchPromises);
    console.log(`[EdgeCacheManager] ${modelIds.length} Modelle prefetched`);
  }

  // =============================================================================
  // Maintenance
  // =============================================================================

  private startMaintenanceLoop(): void {
    setInterval(() => {
      this.performMaintenance();
    }, 5 * 60 * 1000); // Alle 5 Minuten
  }

  private performMaintenance(): void {
    // Cache-Statistiken loggen
    const stats = this.getOverallStats();
    console.debug('[EdgeCacheManager] Cache Stats:', {
      totalSize: `${(stats.totalSize / 1024 / 1024).toFixed(2)}MB`,
      hitRate: `${(stats.overallHitRate * 100).toFixed(1)}%`,
      models: stats.models.totalEntries,
      results: stats.results.totalEntries,
      metadata: stats.metadata.totalEntries
    });

    // Performance-Alerts
    if (stats.overallHitRate < 0.5) {
      console.warn('[EdgeCacheManager] Niedrige Cache-Hit-Rate:', stats.overallHitRate);
    }

    if (stats.totalSize > 800 * 1024 * 1024) { // >800MB
      console.warn('[EdgeCacheManager] Hohe Cache-Nutzung:', stats.totalSize);
    }
  }

  // =============================================================================
  // Event Management
  // =============================================================================

  on<K extends keyof EdgeEventMap>(event: K, listener: (data: EdgeEventMap[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  private emit<K extends keyof EdgeEventMap>(event: K, data: EdgeEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[EdgeCacheManager] Fehler in Event Listener für ${event}:`, error);
        }
      });
    }
  }

  // =============================================================================
  // Utility Functions
  // =============================================================================

  generateInputHash(inputData: ArrayBuffer, processingParams: any): string {
    // Vereinfachte Hash-Funktion für Demo
    const dataView = new Uint8Array(inputData);
    const paramsString = JSON.stringify(processingParams);
    
    let hash = 0;
    for (let i = 0; i < Math.min(dataView.length, 1000); i++) {
      hash = ((hash << 5) - hash + dataView[i]) & 0xffffffff;
    }
    
    for (let i = 0; i < paramsString.length; i++) {
      hash = ((hash << 5) - hash + paramsString.charCodeAt(i)) & 0xffffffff;
    }
    
    return hash.toString(36);
  }

  async cleanup(): Promise<void> {
    this.clearCache();
    this.listeners.clear();
    this.preloadQueue.clear();
    
    console.log('[EdgeCacheManager] Cleanup abgeschlossen');
  }
}
