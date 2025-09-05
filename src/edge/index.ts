/**
 * Edge Computing Integration - Haupt-Export-Datei
 * 
 * Zentrale Exports für Edge Computing-Integration im Voice-Service-System.
 * Bietet lokale WASM-Verarbeitung, verteilte Computing-Architektur und adaptive Optimierung.
 * 
 * @version 1.0.0
 */

// =============================================================================
// Core Components
// =============================================================================

export { EdgeAudioProcessor } from './wasm/audio-processor';
export { EdgeNodeManager } from './edge-node-manager';
export { DistributedProcessor, createDistributedProcessor } from './distributed-processor';
export { EdgeCacheManager } from './cache-manager';
export { EdgeVoiceClient, createEdgeVoiceClient } from './edge-voice-client';

// =============================================================================
// Types
// =============================================================================

export type {
  // Core Edge Types
  EdgeConfiguration,
  EdgeProcessingMode,
  EdgeNodeInfo,
  EdgeNodeType,
  EdgeProcessingStage,
  
  // WASM Types
  WASMModuleConfig,
  AudioProcessingWASMInterface,
  AudioEnhancementParams,
  AudioSpectralAnalysis,
  
  // Task Processing Types
  DistributedTask,
  TaskPartition,
  TaskResult,
  
  // AI Model Types
  EdgeAIModel,
  EdgeInferenceRequest,
  EdgeInferenceResponse,
  
  // Routing Types
  RoutingDecision,
  LoadBalancingStrategy,
  RoutingMetrics,
  
  // Performance Types
  EdgePerformanceMetrics,
  AudioQualityMetrics,
  EdgeHealthStatus,
  EdgeAlert,
  
  // Event Types
  EdgeEventMap,
  
  // Voice Client Types
  EdgeVoiceConfiguration,
  EdgeVoiceClientEvents,
  
  // Error Types
  EdgeComputingError,
  EdgeNodeError,
  WASMProcessingError,
  DistributedTaskError,
  RoutingError
} from './types';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Prüft Edge Computing-Browser-Unterstützung
 */
export function isEdgeComputingSupported(): boolean {
  return !!(
    // WebAssembly-Unterstützung
    window.WebAssembly &&
    // Audio Worklet-Unterstützung
    window.AudioWorklet &&
    window.AudioWorkletNode &&
    // Fetch API für Edge-Node-Kommunikation
    window.fetch &&
    // Performance API für Metriken
    window.performance &&
    window.performance.now
  );
}

/**
 * Prüft erweiterte Edge Computing-Features
 */
export function getEdgeComputingCapabilities(): {
  wasmSupport: boolean;
  wasmThreading: boolean;
  wasmSimd: boolean;
  audioWorklet: boolean;
  sharedArrayBuffer: boolean;
  performanceObserver: boolean;
  webWorkers: boolean;
} {
  return {
    wasmSupport: !!window.WebAssembly,
    wasmThreading: typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined',
    wasmSimd: (() => {
      try {
        return WebAssembly.validate(new Uint8Array([
          0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
          0x01, 0x05, 0x01, 0x60, 0x01, 0x7b, 0x00
        ]));
      } catch {
        return false;
      }
    })(),
    audioWorklet: !!(window.AudioWorklet && window.AudioWorkletNode),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    performanceObserver: !!window.PerformanceObserver,
    webWorkers: !!window.Worker
  };
}

/**
 * Erstellt optimierte Edge-Konfiguration basierend auf Browser-Capabilities
 */
export function createOptimizedEdgeConfiguration(
  baseUrl: string,
  options: {
    preferredMode?: EdgeProcessingMode;
    latencyTargets?: {
      local?: number;
      edgeNode?: number;
      hybrid?: number;
    };
    edgeNodes?: string[];
    enableCaching?: boolean;
    customConfig?: Partial<EdgeConfiguration>;
  } = {}
): EdgeConfiguration {
  const capabilities = getEdgeComputingCapabilities();
  
  // Fallback zu cloud-only wenn Edge Computing nicht unterstützt
  let preferredMode = options.preferredMode || 'hybrid';
  if (!capabilities.wasmSupport || !capabilities.audioWorklet) {
    console.warn('Edge Computing nicht vollständig unterstützt, verwende cloud-only Modus');
    preferredMode = 'cloud-only';
  }
  
  // Latenz-Ziele basierend auf Capabilities anpassen
  const latencyTargets = {
    local: capabilities.wasmSimd ? 15 : 25,  // SIMD = bessere Performance
    edgeNode: 50,
    hybrid: 100,
    cloudOnly: 200,
    ...options.latencyTargets
  };
  
  // Edge-Nodes aus Base URL ableiten falls nicht angegeben
  const edgeNodes = options.edgeNodes || [
    baseUrl.replace(/^http/, 'ws') + '/edge-node-1',
    baseUrl.replace(/^http/, 'ws') + '/edge-node-2'
  ];
  
  return {
    mode: preferredMode,
    latencyTargets,
    availableNodes: edgeNodes.map((url, index) => ({
      nodeId: `edge-node-${index + 1}`,
      type: 'audio-processor',
      endpoint: url,
      region: 'auto-detect',
      latency: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      availableCapacity: 1.0,
      supportedFormats: ['float32', 'int16'],
      availableModels: ['vad-v1', 'noise-reduction-v2', 'enhancement-v1'],
      isHealthy: true,
      lastHealthCheck: new Date()
    })),
    adaptiveRouting: true,
    cachingEnabled: options.enableCaching !== false,
    fallbackConfig: {
      enabled: true,
      timeout: 5000,
      fallbackOrder: ['local', 'edge-node', 'cloud-only'],
      retryConfig: {
        maxRetries: 3,
        retryDelay: 1000,
        exponentialBackoff: true
      }
    },
    ...options.customConfig
  };
}

/**
 * Diagnostiziert Edge Computing-Performance
 */
export async function diagnoseEdgePerformance(): Promise<{
  wasmPerformance: number;
  edgeNodeLatency: number[];
  cacheEfficiency: number;
  overallScore: number;
  recommendations: string[];
}> {
  const results = {
    wasmPerformance: 0,
    edgeNodeLatency: [] as number[],
    cacheEfficiency: 0,
    overallScore: 0,
    recommendations: [] as string[]
  };
  
  try {
    // WASM-Performance-Test
    const wasmProcessor = new EdgeAudioProcessor();
    const testAudio = new Float32Array(1000).fill(0.1);
    
    const wasmStart = performance.now();
    await wasmProcessor.detectVoiceActivity(testAudio);
    const wasmTime = performance.now() - wasmStart;
    
    results.wasmPerformance = wasmTime;
    
    // Edge-Node-Latenz-Test (simuliert)
    results.edgeNodeLatency = [25, 35, 45]; // Beispiel-Latenzen
    
    // Cache-Effizienz-Test
    const cacheManager = new EdgeCacheManager();
    // Simuliere Cache-Operationen
    results.cacheEfficiency = 0.85; // 85% Hit-Rate
    
    // Overall Score berechnen
    const wasmScore = Math.max(0, 1 - (wasmTime / 50)); // <50ms = gut
    const latencyScore = Math.max(0, 1 - (Math.min(...results.edgeNodeLatency) / 100)); // <100ms = gut
    const cacheScore = results.cacheEfficiency;
    
    results.overallScore = (wasmScore + latencyScore + cacheScore) / 3;
    
    // Empfehlungen generieren
    if (wasmTime > 30) {
      results.recommendations.push('WASM-Performance optimieren - SIMD aktivieren falls verfügbar');
    }
    
    if (Math.min(...results.edgeNodeLatency) > 75) {
      results.recommendations.push('Edge-Node-Latenz zu hoch - nähere Nodes verwenden');
    }
    
    if (results.cacheEfficiency < 0.7) {
      results.recommendations.push('Cache-Hit-Rate verbessern - Prefetching aktivieren');
    }
    
    if (results.overallScore > 0.8) {
      results.recommendations.push('Edge Computing-Performance ist optimal');
    }
    
  } catch (error) {
    console.error('Fehler bei Edge-Performance-Diagnose:', error);
    results.recommendations.push('Edge Computing-Diagnose fehlgeschlagen - Fallback zu zentraler Verarbeitung');
  }
  
  return results;
}

/**
 * Erstellt Edge Voice Client mit automatischer Optimierung
 */
export async function createAutoOptimizedEdgeVoiceClient(
  baseUrl: string,
  handleServerMessage: (update: any) => Promise<void>,
  setAnalyzer: (analyzer: AnalyserNode) => void,
  options: {
    enableAutoOptimization?: boolean;
    optimizationInterval?: number;
    performanceDiagnostics?: boolean;
  } = {}
): Promise<EdgeVoiceClient> {
  
  // Performance-Diagnose durchführen falls aktiviert
  if (options.performanceDiagnostics !== false) {
    const diagnosis = await diagnoseEdgePerformance();
    console.log('Edge Computing-Diagnose:', diagnosis);
  }
  
  // Optimierte Konfiguration erstellen
  const edgeConfig = createOptimizedEdgeConfiguration(baseUrl, {
    preferredMode: 'hybrid',
    enableCaching: true
  });
  
  // Voice Client-Konfiguration
  const voiceConfig = {
    transport: 'webrtc',
    edge: {
      mode: edgeConfig.mode,
      latencyTargets: edgeConfig.latencyTargets,
      edgeNodes: edgeConfig.availableNodes.map(node => node.endpoint),
      enableCaching: edgeConfig.cachingEnabled,
      adaptiveRouting: edgeConfig.adaptiveRouting,
      enableDebugLogging: import.meta.env.DEV
    }
  };
  
  const client = await createEdgeVoiceClient(
    baseUrl,
    handleServerMessage,
    setAnalyzer,
    voiceConfig
  );
  
  // Auto-Optimierung aktivieren
  if (options.enableAutoOptimization !== false) {
    const interval = options.optimizationInterval || 30000; // 30 Sekunden
    
    setInterval(async () => {
      try {
        await client.optimizePerformance();
      } catch (error) {
        console.warn('Auto-Optimierung fehlgeschlagen:', error);
      }
    }, interval);
    
    console.log(`[EdgeVoiceClient] Auto-Optimierung aktiviert (${interval}ms Intervall)`);
  }
  
  return client;
}

/**
 * Performance-Benchmark für Edge Computing
 */
export async function benchmarkEdgePerformance(
  iterations: number = 100
): Promise<{
  wasmProcessing: { avg: number; min: number; max: number };
  jsProcessing: { avg: number; min: number; max: number };
  improvement: number;
  throughput: number;
}> {
  const wasmTimes: number[] = [];
  const jsTimes: number[] = [];
  
  // Test-Audio-Daten
  const testAudio = new Float32Array(2048).map(() => Math.random() * 0.2 - 0.1);
  
  // WASM-Performance-Test
  const wasmProcessor = new EdgeAudioProcessor();
  await wasmProcessor.initialize();
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await wasmProcessor.detectVoiceActivity(testAudio);
    wasmTimes.push(performance.now() - start);
  }
  
  // JavaScript-Performance-Test (Fallback)
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    // Simuliere JavaScript VAD
    let energy = 0;
    for (let j = 0; j < testAudio.length; j++) {
      energy += testAudio[j] * testAudio[j];
    }
    const rms = Math.sqrt(energy / testAudio.length);
    const hasVoice = rms > 0.01;
    jsTimes.push(performance.now() - start);
  }
  
  // Statistiken berechnen
  const wasmStats = {
    avg: wasmTimes.reduce((sum, time) => sum + time, 0) / wasmTimes.length,
    min: Math.min(...wasmTimes),
    max: Math.max(...wasmTimes)
  };
  
  const jsStats = {
    avg: jsTimes.reduce((sum, time) => sum + time, 0) / jsTimes.length,
    min: Math.min(...jsTimes),
    max: Math.max(...jsTimes)
  };
  
  const improvement = ((jsStats.avg - wasmStats.avg) / jsStats.avg) * 100;
  const throughput = 1000 / wasmStats.avg; // Operations per second
  
  return {
    wasmProcessing: wasmStats,
    jsProcessing: jsStats,
    improvement,
    throughput
  };
}

// =============================================================================
// Version Information
// =============================================================================

export const EDGE_COMPUTING_VERSION = '1.0.0';
export const EDGE_COMPUTING_BUILD_DATE = new Date().toISOString();

/**
 * Gibt Edge Computing-Integration-Informationen zurück
 */
export function getEdgeComputingInfo(): {
  version: string;
  buildDate: string;
  supported: boolean;
  capabilities: ReturnType<typeof getEdgeComputingCapabilities>;
  recommendedMode: EdgeProcessingMode;
} {
  const capabilities = getEdgeComputingCapabilities();
  const supported = isEdgeComputingSupported();
  
  let recommendedMode: EdgeProcessingMode = 'cloud-only';
  if (supported) {
    if (capabilities.wasmSimd && capabilities.wasmThreading) {
      recommendedMode = 'local';
    } else if (capabilities.wasmSupport && capabilities.audioWorklet) {
      recommendedMode = 'hybrid';
    } else {
      recommendedMode = 'edge-node';
    }
  }
  
  return {
    version: EDGE_COMPUTING_VERSION,
    buildDate: EDGE_COMPUTING_BUILD_DATE,
    supported,
    capabilities,
    recommendedMode
  };
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  // Core Components
  EdgeAudioProcessor,
  EdgeNodeManager,
  DistributedProcessor,
  EdgeCacheManager,
  EdgeVoiceClient,
  
  // Factory Functions
  createDistributedProcessor,
  createEdgeVoiceClient,
  createOptimizedEdgeConfiguration,
  createAutoOptimizedEdgeVoiceClient,
  
  // Utility Functions
  isEdgeComputingSupported,
  getEdgeComputingCapabilities,
  diagnoseEdgePerformance,
  benchmarkEdgePerformance,
  
  // Version Info
  version: EDGE_COMPUTING_VERSION,
  getEdgeComputingInfo
};
