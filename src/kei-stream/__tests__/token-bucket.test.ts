/**
 * Unit-Tests für Token-Bucket Rate-Limiting
 * 
 * Testet die vollständige Token-Bucket-Funktionalität einschließlich:
 * - Token-Consumption und Refill-Mechanismus
 * - Per-Stream-Rate-Limiting
 * - Adaptive Token-Bucket-Algorithmus
 * - Stream-Token-Bucket-Manager
 * 
 * @version 1.0.0
 */

import { 
  TokenBucket, 
  StreamTokenBucketManager, 
  AdaptiveTokenBucket,
  DEFAULT_TOKEN_BUCKET_CONFIG 
} from '../token-bucket';

describe('TokenBucket', () => {
  let bucket: TokenBucket;

  beforeEach(() => {
    bucket = new TokenBucket({
      capacity: 10,
      refillRate: 5, // 5 Tokens pro Sekunde
      initialTokens: 10,
      frameCost: 1,
    });
  });

  describe('Token-Consumption', () => {
    test('sollte Tokens erfolgreich konsumieren', () => {
      expect(bucket.tryConsume(3)).toBe(true);
      expect(bucket.getTokens()).toBe(7);
    });

    test('sollte Consumption ablehnen wenn nicht genug Tokens', () => {
      expect(bucket.tryConsume(15)).toBe(false);
      expect(bucket.getTokens()).toBe(10); // Unverändert
    });

    test('sollte Standard-Frame-Cost verwenden', () => {
      expect(bucket.tryConsume()).toBe(true); // Verwendet frameCost = 1
      expect(bucket.getTokens()).toBe(9);
    });

    test('sollte Bucket leeren können', () => {
      bucket.tryConsume(10);
      expect(bucket.isEmpty()).toBe(true);
      expect(bucket.getTokens()).toBe(0);
    });
  });

  describe('Token-Refill', () => {
    test('sollte Tokens über Zeit auffüllen', async () => {
      // Alle Tokens konsumieren
      bucket.tryConsume(10);
      expect(bucket.getTokens()).toBe(0);

      // 1 Sekunde warten (sollte 5 Tokens hinzufügen)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      expect(bucket.getTokens()).toBeCloseTo(5, 0);
    });

    test('sollte Kapazität nicht überschreiten', async () => {
      // Warten bis Bucket voll ist
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(bucket.getTokens()).toBeLessThanOrEqual(10);
      expect(bucket.isFull()).toBe(true);
    });

    test('sollte partielle Refills korrekt berechnen', async () => {
      bucket.tryConsume(10); // Bucket leeren
      
      // 0.5 Sekunden warten (sollte 2.5 Tokens hinzufügen)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const tokens = bucket.getTokens();
      expect(tokens).toBeGreaterThan(2);
      expect(tokens).toBeLessThan(3);
    });
  });

  describe('Bucket-Status', () => {
    test('sollte korrekten Status zurückgeben', () => {
      const status = bucket.getStatus();
      
      expect(status.capacity).toBe(10);
      expect(status.refillRate).toBe(5);
      expect(status.frameCost).toBe(1);
      expect(status.utilizationPercent).toBe(100); // Voll
      expect(status.timeToFull).toBe(0);
    });

    test('sollte Utilization korrekt berechnen', () => {
      bucket.tryConsume(5); // 50% verbraucht
      
      const status = bucket.getStatus();
      expect(status.utilizationPercent).toBe(50);
    });

    test('sollte Time-to-Full korrekt berechnen', () => {
      bucket.tryConsume(10); // Bucket leeren
      
      const status = bucket.getStatus();
      expect(status.timeToFull).toBe(2000); // 10 Tokens / 5 per sec = 2 sec = 2000ms
    });
  });

  describe('Async Consumption', () => {
    test('sollte auf verfügbare Tokens warten', async () => {
      bucket.tryConsume(10); // Bucket leeren
      
      const startTime = Date.now();
      await bucket.consume(3); // Warten auf 3 Tokens
      const endTime = Date.now();
      
      // Sollte mindestens 600ms warten (3 Tokens / 5 per sec = 0.6 sec)
      expect(endTime - startTime).toBeGreaterThan(500);
      expect(bucket.getTokens()).toBeLessThan(3);
    });
  });

  describe('Bucket-Reset', () => {
    test('sollte Bucket zurücksetzen', () => {
      bucket.tryConsume(5);
      bucket.reset();
      
      expect(bucket.getTokens()).toBe(10);
      expect(bucket.isFull()).toBe(true);
    });

    test('sollte Bucket mit spezifischer Token-Anzahl zurücksetzen', () => {
      bucket.reset(3);
      
      expect(bucket.getTokens()).toBe(3);
      expect(bucket.isFull()).toBe(false);
    });
  });
});

describe('StreamTokenBucketManager', () => {
  let manager: StreamTokenBucketManager;

  beforeEach(() => {
    manager = new StreamTokenBucketManager({
      capacity: 20,
      refillRate: 10,
      frameCost: 1,
    });
  });

  describe('Bucket-Management', () => {
    test('sollte Buckets für Streams erstellen', () => {
      const bucket1 = manager.getBucket('stream-1');
      const bucket2 = manager.getBucket('stream-2');
      
      expect(bucket1).toBeDefined();
      expect(bucket2).toBeDefined();
      expect(bucket1).not.toBe(bucket2);
    });

    test('sollte gleichen Bucket für gleichen Stream zurückgeben', () => {
      const bucket1 = manager.getBucket('stream-1');
      const bucket2 = manager.getBucket('stream-1');
      
      expect(bucket1).toBe(bucket2);
    });

    test('sollte Tokens für spezifischen Stream konsumieren', () => {
      expect(manager.tryConsumeForStream('stream-1', 5)).toBe(true);
      expect(manager.tryConsumeForStream('stream-1', 20)).toBe(false); // Nicht genug übrig
    });

    test('sollte Buckets unabhängig verwalten', () => {
      manager.tryConsumeForStream('stream-1', 15);
      
      // Stream-2 sollte unberührt sein
      expect(manager.tryConsumeForStream('stream-2', 15)).toBe(true);
    });
  });

  describe('Status und Statistiken', () => {
    test('sollte Status aller Buckets zurückgeben', () => {
      manager.getBucket('stream-1');
      manager.getBucket('stream-2');
      
      const allStatus = manager.getAllStatus();
      
      expect(Object.keys(allStatus)).toHaveLength(2);
      expect(allStatus['stream-1']).toBeDefined();
      expect(allStatus['stream-2']).toBeDefined();
    });

    test('sollte Bucket-Anzahl korrekt zählen', () => {
      expect(manager.getBucketCount()).toBe(0);
      
      manager.getBucket('stream-1');
      manager.getBucket('stream-2');
      
      expect(manager.getBucketCount()).toBe(2);
    });
  });

  describe('Bucket-Cleanup', () => {
    test('sollte Buckets entfernen können', () => {
      manager.getBucket('stream-1');
      expect(manager.getBucketCount()).toBe(1);
      
      manager.removeBucket('stream-1');
      expect(manager.getBucketCount()).toBe(0);
    });

    test('sollte alle Buckets zurücksetzen', () => {
      const bucket1 = manager.getBucket('stream-1');
      const bucket2 = manager.getBucket('stream-2');
      
      bucket1.tryConsume(10);
      bucket2.tryConsume(15);
      
      manager.resetAll();
      
      expect(bucket1.isFull()).toBe(true);
      expect(bucket2.isFull()).toBe(true);
    });
  });

  describe('Async Stream-Consumption', () => {
    test('sollte auf Tokens für Stream warten', async () => {
      // Stream-1 Bucket leeren
      manager.tryConsumeForStream('stream-1', 20);
      
      const startTime = Date.now();
      await manager.consumeForStream('stream-1', 5);
      const endTime = Date.now();
      
      // Sollte warten müssen
      expect(endTime - startTime).toBeGreaterThan(400);
    });
  });
});

describe('AdaptiveTokenBucket', () => {
  let adaptiveBucket: AdaptiveTokenBucket;

  beforeEach(() => {
    adaptiveBucket = new AdaptiveTokenBucket(
      {
        capacity: 100,
        refillRate: 50,
        frameCost: 1,
      },
      {
        adaptationInterval: 100, // Schnelle Adaptation für Tests
        minRefillRate: 10,
        maxRefillRate: 100,
      }
    );
  });

  describe('Adaptive Rate-Anpassung', () => {
    test('sollte Rate bei niedriger Erfolgsrate erhöhen', async () => {
      const initialRate = adaptiveBucket.getRefillRate();
      
      // Bucket leeren um niedrige Erfolgsrate zu simulieren
      adaptiveBucket.tryConsume(100);
      
      // Mehrere fehlgeschlagene Versuche
      for (let i = 0; i < 20; i++) {
        adaptiveBucket.tryConsume(1);
      }
      
      // Warten auf Adaptation
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const newRate = adaptiveBucket.getRefillRate();
      expect(newRate).toBeGreaterThan(initialRate);
    });

    test('sollte Rate bei hoher Erfolgsrate verringern', async () => {
      const initialRate = adaptiveBucket.getRefillRate();
      
      // Viele erfolgreiche Versuche
      for (let i = 0; i < 20; i++) {
        adaptiveBucket.tryConsume(1);
        await new Promise(resolve => setTimeout(resolve, 5)); // Kurz warten für Refill
      }
      
      // Warten auf Adaptation
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const newRate = adaptiveBucket.getRefillRate();
      expect(newRate).toBeLessThanOrEqual(initialRate);
    });

    test('sollte Min/Max-Grenzen respektieren', async () => {
      // Rate sollte nicht unter Minimum fallen
      for (let i = 0; i < 50; i++) {
        adaptiveBucket.tryConsume(1);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(adaptiveBucket.getRefillRate()).toBeGreaterThanOrEqual(10);
      expect(adaptiveBucket.getRefillRate()).toBeLessThanOrEqual(100);
    });
  });

  describe('Adaptive Status', () => {
    test('sollte erweiterten Status mit Adaptation-Informationen liefern', () => {
      // Einige Versuche durchführen
      for (let i = 0; i < 10; i++) {
        adaptiveBucket.tryConsume(1);
      }
      
      const status = adaptiveBucket.getAdaptiveStatus();
      
      expect(status.successRate).toBeDefined();
      expect(status.adaptationInterval).toBe(100);
      expect(status.usageHistoryLength).toBe(10);
    });
  });
});

describe('Token-Bucket Integration', () => {
  test('sollte mit KEI-Stream-Client kompatibel sein', () => {
    const manager = new StreamTokenBucketManager(DEFAULT_TOKEN_BUCKET_CONFIG);
    
    // Simuliere KEI-Stream-Client Nutzung
    const streamId = 'integration-test-stream';
    
    // Mehrere Frames senden
    for (let i = 0; i < 10; i++) {
      const canSend = manager.tryConsumeForStream(streamId);
      expect(typeof canSend).toBe('boolean');
    }
    
    const status = manager.getAllStatus();
    expect(status[streamId]).toBeDefined();
    expect(status[streamId].tokens).toBeLessThan(DEFAULT_TOKEN_BUCKET_CONFIG.capacity);
  });
});
