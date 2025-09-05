/**
 * Token-Bucket Rate-Limiting für KEI-Stream
 * 
 * Browser-optimierte Token-Bucket-Implementation für Per-Stream-Rate-Limiting mit:
 * - Konfigurierbare Token-Refill-Rate
 * - Burst-Capacity-Management
 * - Per-Stream-Fairness
 * - Kompatibilität mit Backend Token-Bucket-System
 * 
 * @version 1.0.0
 */

/**
 * Token-Bucket-Konfiguration
 */
export interface TokenBucketConfig {
  /** Maximale Anzahl Tokens im Bucket */
  capacity: number;
  /** Token-Refill-Rate pro Sekunde */
  refillRate: number;
  /** Initiale Token-Anzahl */
  initialTokens?: number;
  /** Kosten pro Frame in Tokens */
  frameCost?: number;
}

/**
 * Standard-Token-Bucket-Konfiguration
 */
export const DEFAULT_TOKEN_BUCKET_CONFIG: TokenBucketConfig = {
  capacity: 100,
  refillRate: 50, // 50 Tokens pro Sekunde
  initialTokens: 50,
  frameCost: 1,
};

/**
 * Token-Bucket für Rate-Limiting
 * 
 * Implementiert Token-Bucket-Algorithmus für gleichmäßige Rate-Limiting
 * mit Burst-Capacity. Kompatibel mit Backend Token-Bucket-System.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly frameCost: number;

  constructor(config: Partial<TokenBucketConfig> = {}) {
    const finalConfig = { ...DEFAULT_TOKEN_BUCKET_CONFIG, ...config };
    
    this.capacity = finalConfig.capacity;
    this.refillRate = finalConfig.refillRate;
    this.frameCost = finalConfig.frameCost!;
    this.tokens = finalConfig.initialTokens ?? finalConfig.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Versucht Tokens zu konsumieren
   * 
   * @param tokens Anzahl zu konsumierender Tokens (default: frameCost)
   * @returns true wenn Tokens verfügbar waren, false sonst
   */
  tryConsume(tokens: number = this.frameCost): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }

  /**
   * Konsumiert Tokens (blockierend)
   * 
   * @param tokens Anzahl zu konsumierender Tokens
   * @returns Promise das resolved wenn Tokens verfügbar sind
   */
  async consume(tokens: number = this.frameCost): Promise<void> {
    while (!this.tryConsume(tokens)) {
      // Warten bis genügend Tokens verfügbar sind
      const waitTime = this.calculateWaitTime(tokens);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Berechnet Wartezeit bis genügend Tokens verfügbar sind
   */
  private calculateWaitTime(tokens: number): number {
    this.refill();
    
    if (this.tokens >= tokens) {
      return 0;
    }
    
    const neededTokens = tokens - this.tokens;
    const waitTimeMs = (neededTokens / this.refillRate) * 1000;
    
    // Minimum 10ms, Maximum 5 Sekunden
    return Math.max(10, Math.min(waitTimeMs, 5000));
  }

  /**
   * Füllt Tokens basierend auf verstrichener Zeit auf
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // Sekunden
    
    if (elapsed > 0) {
      const tokensToAdd = elapsed * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Gibt aktuelle Token-Anzahl zurück
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Gibt verfügbare Kapazität zurück
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Gibt Refill-Rate zurück
   */
  getRefillRate(): number {
    return this.refillRate;
  }

  /**
   * Prüft ob Bucket voll ist
   */
  isFull(): boolean {
    this.refill();
    return this.tokens >= this.capacity;
  }

  /**
   * Prüft ob Bucket leer ist
   */
  isEmpty(): boolean {
    this.refill();
    return this.tokens <= 0;
  }

  /**
   * Setzt Token-Anzahl zurück
   */
  reset(tokens?: number): void {
    this.tokens = tokens ?? this.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Gibt Token-Bucket-Status zurück
   */
  getStatus(): {
    tokens: number;
    capacity: number;
    refillRate: number;
    frameCost: number;
    utilizationPercent: number;
    timeToFull: number;
  } {
    this.refill();
    
    const utilizationPercent = (this.tokens / this.capacity) * 100;
    const timeToFull = this.tokens >= this.capacity ? 0 : 
      ((this.capacity - this.tokens) / this.refillRate) * 1000;
    
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
      frameCost: this.frameCost,
      utilizationPercent,
      timeToFull,
    };
  }
}

/**
 * Per-Stream Token-Bucket-Manager
 * 
 * Verwaltet separate Token-Buckets für verschiedene Streams
 * und stellt Fairness zwischen Streams sicher.
 */
export class StreamTokenBucketManager {
  private buckets: Map<string, TokenBucket> = new Map();
  private defaultConfig: TokenBucketConfig;

  constructor(defaultConfig: Partial<TokenBucketConfig> = {}) {
    this.defaultConfig = { ...DEFAULT_TOKEN_BUCKET_CONFIG, ...defaultConfig };
  }

  /**
   * Holt oder erstellt Token-Bucket für Stream
   */
  getBucket(streamId: string, config?: Partial<TokenBucketConfig>): TokenBucket {
    let bucket = this.buckets.get(streamId);
    
    if (!bucket) {
      const bucketConfig = config ? { ...this.defaultConfig, ...config } : this.defaultConfig;
      bucket = new TokenBucket(bucketConfig);
      this.buckets.set(streamId, bucket);
    }
    
    return bucket;
  }

  /**
   * Versucht Tokens für Stream zu konsumieren
   */
  tryConsumeForStream(streamId: string, tokens?: number): boolean {
    const bucket = this.getBucket(streamId);
    return bucket.tryConsume(tokens);
  }

  /**
   * Konsumiert Tokens für Stream (blockierend)
   */
  async consumeForStream(streamId: string, tokens?: number): Promise<void> {
    const bucket = this.getBucket(streamId);
    await bucket.consume(tokens);
  }

  /**
   * Entfernt Token-Bucket für Stream
   */
  removeBucket(streamId: string): void {
    this.buckets.delete(streamId);
  }

  /**
   * Setzt alle Token-Buckets zurück
   */
  resetAll(): void {
    this.buckets.forEach(bucket => bucket.reset());
  }

  /**
   * Gibt Status aller Token-Buckets zurück
   */
  getAllStatus(): Record<string, ReturnType<TokenBucket['getStatus']>> {
    const status: Record<string, ReturnType<TokenBucket['getStatus']>> = {};
    
    this.buckets.forEach((bucket, streamId) => {
      status[streamId] = bucket.getStatus();
    });
    
    return status;
  }

  /**
   * Gibt Anzahl verwalteter Buckets zurück
   */
  getBucketCount(): number {
    return this.buckets.size;
  }

  /**
   * Bereinigt inaktive Buckets
   */
  cleanup(maxIdleTime: number = 300000): void { // 5 Minuten
    const now = Date.now();
    const bucketsToRemove: string[] = [];
    
    this.buckets.forEach((bucket, streamId) => {
      const status = bucket.getStatus();
      // Entferne Buckets die voll sind und lange nicht verwendet wurden
      if (status.utilizationPercent >= 95 && 
          (now - bucket['lastRefill']) > maxIdleTime) {
        bucketsToRemove.push(streamId);
      }
    });
    
    bucketsToRemove.forEach(streamId => {
      this.buckets.delete(streamId);
    });
  }
}

/**
 * Adaptive Token-Bucket mit dynamischer Rate-Anpassung
 * 
 * Passt Refill-Rate basierend auf Nutzungsmustern an.
 */
export class AdaptiveTokenBucket extends TokenBucket {
  private usageHistory: number[] = [];
  private adaptationInterval: number;
  private lastAdaptation: number;
  private minRefillRate: number;
  private maxRefillRate: number;

  constructor(
    config: Partial<TokenBucketConfig> = {},
    adaptationConfig: {
      adaptationInterval?: number;
      minRefillRate?: number;
      maxRefillRate?: number;
    } = {}
  ) {
    super(config);
    
    this.adaptationInterval = adaptationConfig.adaptationInterval ?? 10000; // 10 Sekunden
    this.minRefillRate = adaptationConfig.minRefillRate ?? 10;
    this.maxRefillRate = adaptationConfig.maxRefillRate ?? 200;
    this.lastAdaptation = Date.now();
  }

  /**
   * Überschreibt tryConsume um Nutzung zu tracken
   */
  tryConsume(tokens: number = this.frameCost): boolean {
    const success = super.tryConsume(tokens);
    
    // Nutzung für Adaptation tracken
    this.trackUsage(success);
    
    return success;
  }

  /**
   * Trackt Nutzungsmuster für Adaptation
   */
  private trackUsage(success: boolean): void {
    this.usageHistory.push(success ? 1 : 0);
    
    // Behalte nur letzte 100 Einträge
    if (this.usageHistory.length > 100) {
      this.usageHistory.shift();
    }
    
    // Prüfe ob Adaptation nötig ist
    const now = Date.now();
    if (now - this.lastAdaptation > this.adaptationInterval) {
      this.adaptRefillRate();
      this.lastAdaptation = now;
    }
  }

  /**
   * Passt Refill-Rate basierend auf Nutzungsmustern an
   */
  private adaptRefillRate(): void {
    if (this.usageHistory.length < 10) {
      return; // Nicht genug Daten
    }
    
    const successRate = this.usageHistory.reduce((sum, val) => sum + val, 0) / this.usageHistory.length;
    
    // Niedrige Erfolgsrate = Rate erhöhen
    // Hohe Erfolgsrate = Rate verringern (Ressourcen sparen)
    if (successRate < 0.7 && this.refillRate < this.maxRefillRate) {
      // Rate um 10% erhöhen
      const newRate = Math.min(this.maxRefillRate, this.refillRate * 1.1);
      (this as any).refillRate = newRate;
    } else if (successRate > 0.95 && this.refillRate > this.minRefillRate) {
      // Rate um 5% verringern
      const newRate = Math.max(this.minRefillRate, this.refillRate * 0.95);
      (this as any).refillRate = newRate;
    }
  }

  /**
   * Gibt erweiterten Status mit Adaptation-Informationen zurück
   */
  getAdaptiveStatus(): ReturnType<TokenBucket['getStatus']> & {
    successRate: number;
    adaptationInterval: number;
    usageHistoryLength: number;
  } {
    const baseStatus = this.getStatus();
    const successRate = this.usageHistory.length > 0 ? 
      this.usageHistory.reduce((sum, val) => sum + val, 0) / this.usageHistory.length : 0;
    
    return {
      ...baseStatus,
      successRate,
      adaptationInterval: this.adaptationInterval,
      usageHistoryLength: this.usageHistory.length,
    };
  }
}
