/**
 * Edge Computing Types für Voice-Service-System
 * 
 * Definiert alle TypeScript-Typen für Edge Computing-Integration.
 * Unterstützt lokale Audio-Verarbeitung und verteilte Computing-Architektur.
 * 
 * @version 1.0.0
 */

// =============================================================================
// Edge Computing Core Types
// =============================================================================

export type EdgeProcessingMode = 'local' | 'edge-node' | 'hybrid' | 'cloud-only';
export type EdgeNodeType = 'audio-processor' | 'ai-inference' | 'cache-node' | 'load-balancer';
export type EdgeProcessingStage = 'preprocessing' | 'inference' | 'postprocessing' | 'caching';

export interface EdgeConfiguration {
  /** Edge Processing-Modus */
  mode: EdgeProcessingMode;
  /** Latenz-Ziele in ms */
  latencyTargets: {
    local: number;        // <20ms
    edgeNode: number;     // <50ms
    hybrid: number;       // <100ms
    cloudOnly: number;    // <200ms
  };
  /** Verfügbare Edge-Nodes */
  availableNodes: EdgeNodeInfo[];
  /** Adaptive Routing aktiviert */
  adaptiveRouting: boolean;
  /** Caching-Strategien */
  cachingEnabled: boolean;
  /** Fallback-Konfiguration */
  fallbackConfig: EdgeFallbackConfig;
}

export interface EdgeNodeInfo {
  /** Node ID */
  nodeId: string;
  /** Node Type */
  type: EdgeNodeType;
  /** Endpoint URL */
  endpoint: string;
  /** Geografische Region */
  region: string;
  /** Aktuelle Latenz in ms */
  latency: number;
  /** CPU-Auslastung (0-1) */
  cpuUsage: number;
  /** Memory-Auslastung (0-1) */
  memoryUsage: number;
  /** Verfügbare Kapazität (0-1) */
  availableCapacity: number;
  /** Unterstützte Audio-Formate */
  supportedFormats: string[];
  /** Verfügbare AI-Modelle */
  availableModels: string[];
  /** Health Status */
  isHealthy: boolean;
  /** Letzter Health Check */
  lastHealthCheck: Date;
}

export interface EdgeFallbackConfig {
  /** Automatischer Fallback aktiviert */
  enabled: boolean;
  /** Fallback-Timeout in ms */
  timeout: number;
  /** Fallback-Reihenfolge */
  fallbackOrder: EdgeProcessingMode[];
  /** Retry-Strategien */
  retryConfig: {
    maxRetries: number;
    retryDelay: number;
    exponentialBackoff: boolean;
  };
}

// =============================================================================
// WebAssembly Processing Types
// =============================================================================

export interface WASMModuleConfig {
  /** WASM-Modul Name */
  moduleName: string;
  /** WASM-Datei URL */
  wasmUrl: string;
  /** Initialisierungs-Parameter */
  initParams: Record<string, any>;
  /** Memory-Konfiguration */
  memoryConfig: {
    initial: number;    // Initial memory pages
    maximum: number;    // Maximum memory pages
    shared: boolean;    // Shared memory support
  };
  /** Threading-Unterstützung */
  threadingEnabled: boolean;
  /** SIMD-Unterstützung */
  simdEnabled: boolean;
}

export interface AudioProcessingWASMInterface {
  /** Audio-Daten verarbeiten */
  processAudio(audioData: Float32Array, sampleRate: number): Promise<Float32Array>;
  /** Voice Activity Detection */
  detectVoiceActivity(audioData: Float32Array): Promise<boolean>;
  /** Noise Reduction */
  reduceNoise(audioData: Float32Array, noiseProfile?: Float32Array): Promise<Float32Array>;
  /** Echo Cancellation */
  cancelEcho(audioData: Float32Array, referenceAudio?: Float32Array): Promise<Float32Array>;
  /** Audio Enhancement */
  enhanceAudio(audioData: Float32Array, enhancementParams?: AudioEnhancementParams): Promise<Float32Array>;
  /** Spektral-Analyse */
  analyzeSpectrum(audioData: Float32Array): Promise<AudioSpectralAnalysis>;
}

export interface AudioEnhancementParams {
  /** Gain Control */
  gainControl: number;
  /** Noise Gate Threshold */
  noiseGate: number;
  /** Kompression-Ratio */
  compressionRatio: number;
  /** EQ-Einstellungen */
  equalizerBands: EqualizerBand[];
  /** Dynamik-Verarbeitung */
  dynamicsProcessing: DynamicsProcessingParams;
}

export interface EqualizerBand {
  /** Frequenz in Hz */
  frequency: number;
  /** Gain in dB */
  gain: number;
  /** Q-Faktor */
  q: number;
  /** Filter-Type */
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking' | 'lowshelf' | 'highshelf';
}

export interface DynamicsProcessingParams {
  /** Kompressor-Einstellungen */
  compressor: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
    knee: number;
  };
  /** Limiter-Einstellungen */
  limiter: {
    threshold: number;
    release: number;
  };
  /** Gate-Einstellungen */
  gate: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  };
}

export interface AudioSpectralAnalysis {
  /** Frequenz-Spektrum */
  frequencySpectrum: Float32Array;
  /** Mel-Spektrogramm */
  melSpectrogram: Float32Array;
  /** MFCC-Features */
  mfccFeatures: Float32Array;
  /** Fundamental Frequency */
  fundamentalFreq: number;
  /** Spectral Centroid */
  spectralCentroid: number;
  /** Spectral Rolloff */
  spectralRolloff: number;
  /** Zero Crossing Rate */
  zeroCrossingRate: number;
}

// =============================================================================
// Edge AI Processing Types
// =============================================================================

export interface EdgeAIModel {
  /** Model ID */
  modelId: string;
  /** Model Name */
  name: string;
  /** Model Type */
  type: 'vad' | 'speech-enhancement' | 'speaker-recognition' | 'emotion-detection' | 'language-detection';
  /** Model Version */
  version: string;
  /** Model Size in MB */
  sizeInMB: number;
  /** Unterstützte Input-Formate */
  inputFormats: string[];
  /** Erwartete Latenz in ms */
  expectedLatency: number;
  /** Accuracy Score */
  accuracy: number;
  /** WASM-kompatibel */
  wasmCompatible: boolean;
  /** GPU-Unterstützung */
  gpuAccelerated: boolean;
}

export interface EdgeInferenceRequest {
  /** Request ID */
  requestId: string;
  /** Model ID */
  modelId: string;
  /** Input-Daten */
  inputData: ArrayBuffer | Float32Array;
  /** Input-Metadaten */
  inputMetadata: {
    sampleRate: number;
    channels: number;
    duration: number;
    format: string;
  };
  /** Processing-Parameter */
  processingParams: Record<string, any>;
  /** Priorität */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Timeout in ms */
  timeout: number;
}

export interface EdgeInferenceResponse {
  /** Request ID */
  requestId: string;
  /** Verarbeitungszeit in ms */
  processingTime: number;
  /** Erfolg */
  success: boolean;
  /** Ergebnis-Daten */
  resultData: any;
  /** Confidence Score */
  confidence: number;
  /** Verwendete Edge-Node */
  processedBy: string;
  /** Error-Information */
  error?: string;
  /** Metadaten */
  metadata: Record<string, any>;
}

// =============================================================================
// Distributed Computing Types
// =============================================================================

export interface DistributedTask {
  /** Task ID */
  taskId: string;
  /** Task Type */
  type: 'audio-processing' | 'ai-inference' | 'data-transformation';
  /** Input-Daten */
  inputData: ArrayBuffer;
  /** Task-Parameter */
  parameters: Record<string, any>;
  /** Abhängigkeiten */
  dependencies: string[];
  /** Priorität */
  priority: number;
  /** Deadline */
  deadline: Date;
  /** Partitionierbar */
  partitionable: boolean;
}

export interface TaskPartition {
  /** Partition ID */
  partitionId: string;
  /** Parent Task ID */
  parentTaskId: string;
  /** Partition-Daten */
  data: ArrayBuffer;
  /** Partition-Index */
  index: number;
  /** Gesamt-Partitionen */
  totalPartitions: number;
  /** Ziel-Node */
  targetNode: string;
}

export interface TaskResult {
  /** Task/Partition ID */
  taskId: string;
  /** Verarbeitungszeit */
  processingTime: number;
  /** Ergebnis-Daten */
  resultData: ArrayBuffer;
  /** Erfolg */
  success: boolean;
  /** Error-Information */
  error?: string;
  /** Verwendete Ressourcen */
  resourceUsage: {
    cpu: number;
    memory: number;
    bandwidth: number;
  };
}

// =============================================================================
// Adaptive Routing Types
// =============================================================================

export interface RoutingDecision {
  /** Gewählte Edge-Node */
  selectedNode: EdgeNodeInfo;
  /** Routing-Grund */
  reason: 'latency' | 'capacity' | 'model-availability' | 'cost' | 'fallback';
  /** Erwartete Latenz */
  expectedLatency: number;
  /** Confidence in Entscheidung */
  confidence: number;
  /** Alternative Nodes */
  alternatives: EdgeNodeInfo[];
}

export interface RoutingMetrics {
  /** Durchschnittliche Latenz pro Node */
  averageLatencyByNode: Map<string, number>;
  /** Erfolgsrate pro Node */
  successRateByNode: Map<string, number>;
  /** Kapazitäts-Auslastung */
  capacityUtilization: Map<string, number>;
  /** Routing-Entscheidungen */
  routingDecisions: RoutingDecision[];
  /** Performance-Trends */
  performanceTrends: Map<string, number[]>;
}

export interface LoadBalancingStrategy {
  /** Strategie-Name */
  name: 'round-robin' | 'least-connections' | 'weighted-round-robin' | 'latency-based' | 'capacity-based' | 'adaptive';
  /** Gewichtungen */
  weights: {
    latency: number;
    capacity: number;
    reliability: number;
    cost: number;
  };
  /** Adaptive Parameter */
  adaptiveParams: {
    learningRate: number;
    explorationRate: number;
    decayFactor: number;
  };
}

// =============================================================================
// Performance Monitoring Types
// =============================================================================

export interface EdgePerformanceMetrics {
  /** Latenz-Metriken */
  latency: {
    local: number;
    edgeNode: number;
    hybrid: number;
    cloudOnly: number;
    p50: number;
    p95: number;
    p99: number;
  };
  /** Durchsatz-Metriken */
  throughput: {
    requestsPerSecond: number;
    bytesPerSecond: number;
    tasksPerSecond: number;
  };
  /** Ressourcen-Nutzung */
  resourceUsage: {
    cpu: number;
    memory: number;
    bandwidth: number;
    storage: number;
  };
  /** Erfolgsraten */
  successRates: {
    overall: number;
    byProcessingMode: Map<EdgeProcessingMode, number>;
    byNodeType: Map<EdgeNodeType, number>;
  };
  /** Cache-Metriken */
  cacheMetrics: {
    hitRate: number;
    missRate: number;
    evictionRate: number;
    averageRetrievalTime: number;
  };
}

export interface EdgeHealthStatus {
  /** Gesamt-Gesundheit */
  overall: 'healthy' | 'degraded' | 'unhealthy';
  /** Node-spezifische Gesundheit */
  nodeHealth: Map<string, 'healthy' | 'degraded' | 'unhealthy'>;
  /** Aktive Warnungen */
  activeAlerts: EdgeAlert[];
  /** Letzte Health Checks */
  lastHealthChecks: Map<string, Date>;
  /** System-Kapazität */
  systemCapacity: {
    total: number;
    available: number;
    reserved: number;
  };
}

export interface EdgeAlert {
  /** Alert ID */
  alertId: string;
  /** Alert Level */
  level: 'info' | 'warning' | 'error' | 'critical';
  /** Alert Message */
  message: string;
  /** Betroffene Node */
  nodeId?: string;
  /** Timestamp */
  timestamp: Date;
  /** Alert-Typ */
  type: 'latency' | 'capacity' | 'error-rate' | 'connectivity' | 'resource-usage';
  /** Metadaten */
  metadata: Record<string, any>;
}

// =============================================================================
// Event Types
// =============================================================================

export interface EdgeEventMap {
  'node-added': { node: EdgeNodeInfo };
  'node-removed': { nodeId: string };
  'node-health-changed': { nodeId: string; health: 'healthy' | 'degraded' | 'unhealthy' };
  'routing-decision': { decision: RoutingDecision };
  'task-completed': { result: TaskResult };
  'task-failed': { taskId: string; error: string };
  'cache-hit': { modelId: string; retrievalTime: number };
  'cache-miss': { modelId: string };
  'performance-alert': { alert: EdgeAlert };
  'latency-threshold-exceeded': { nodeId: string; latency: number; threshold: number };
  'capacity-threshold-exceeded': { nodeId: string; usage: number; threshold: number };
}

// =============================================================================
// Error Types
// =============================================================================

export class EdgeComputingError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'EdgeComputingError';
  }
}

export class EdgeNodeError extends EdgeComputingError {
  constructor(message: string, public nodeId: string, context?: Record<string, any>) {
    super(message, 'EDGE_NODE_ERROR', { nodeId, ...context });
    this.name = 'EdgeNodeError';
  }
}

export class WASMProcessingError extends EdgeComputingError {
  constructor(message: string, public moduleName: string, context?: Record<string, any>) {
    super(message, 'WASM_PROCESSING_ERROR', { moduleName, ...context });
    this.name = 'WASMProcessingError';
  }
}

export class DistributedTaskError extends EdgeComputingError {
  constructor(message: string, public taskId: string, context?: Record<string, any>) {
    super(message, 'DISTRIBUTED_TASK_ERROR', { taskId, ...context });
    this.name = 'DistributedTaskError';
  }
}

export class RoutingError extends EdgeComputingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'ROUTING_ERROR', context);
    this.name = 'RoutingError';
  }
}
