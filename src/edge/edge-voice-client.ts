/**
 * Edge-Enhanced Voice Client
 * 
 * Erweitert die bestehende Voice-Client-Architektur um Edge Computing-Fähigkeiten.
 * Integriert lokale WASM-Verarbeitung, Edge-Nodes und adaptive Routing.
 * 
 * @version 1.0.0
 */

import type { VoiceConfiguration } from '@/store';
import type { Update } from '@/store/voice-client';
import type {
  EdgeConfiguration,
  EdgeProcessingMode,
  EdgePerformanceMetrics,
  EdgeEventMap,
  DistributedTask,
  TaskResult
} from './types';

import { DistributedProcessor, createDistributedProcessor } from './distributed-processor';
import { EdgeCacheManager } from './cache-manager';
import { EdgeAudioProcessor } from './wasm/audio-processor';

// =============================================================================
// Enhanced Voice Configuration
// =============================================================================

export interface EdgeVoiceConfiguration extends VoiceConfiguration {
  /** Edge Computing-Einstellungen */
  edge?: {
    /** Processing-Modus */
    mode?: EdgeProcessingMode;
    /** Verfügbare Edge-Nodes */
    edgeNodes?: string[];
    /** Latenz-Ziele */
    latencyTargets?: {
      local: number;
      edgeNode: number;
      hybrid: number;
    };
    /** Caching aktiviert */
    enableCaching?: boolean;
    /** Adaptive Routing aktiviert */
    adaptiveRouting?: boolean;
    /** Debug Logging */
    enableDebugLogging?: boolean;
  };
}

// =============================================================================
// Edge Voice Client Events
// =============================================================================

export interface EdgeVoiceClientEvents extends EdgeEventMap {
  'processing-mode-changed': { mode: EdgeProcessingMode; reason: string };
  'edge-performance-update': { metrics: EdgePerformanceMetrics };
  'task-completed': { taskId: string; result: TaskResult; processingTime: number };
  'cache-performance': { hitRate: number; averageRetrievalTime: number };
  'latency-optimized': { originalLatency: number; optimizedLatency: number; improvement: number };
}

// =============================================================================
// Edge Voice Client
// =============================================================================

export class EdgeVoiceClient {
  private distributedProcessor: DistributedProcessor;
  private cacheManager: EdgeCacheManager;
  private localProcessor: EdgeAudioProcessor;
  private handleServerMessage: (update: Update) => Promise<void>;
  private setAnalyzer: (analyzer: AnalyserNode) => void;
  private config: EdgeVoiceConfiguration;
  
  private isStarted: boolean = false;
  private currentDeviceId: string | null = null;
  private listeners: Map<string, Function[]> = new Map();
  
  // Audio Processing
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioProcessor: AudioWorkletNode | null = null;
  private analyzerNode: AnalyserNode | null = null;
  
  // Performance Monitoring
  private performanceMetrics: EdgePerformanceMetrics | null = null;
  private performanceMonitorInterval: NodeJS.Timeout | null = null;
  private latencyHistory: number[] = [];

  constructor(
    baseUrl: string,
    handleServerMessage: (update: Update) => Promise<void>,
    setAnalyzer: (analyzer: AnalyserNode) => void,
    config: EdgeVoiceConfiguration
  ) {
    this.handleServerMessage = handleServerMessage;
    this.setAnalyzer = setAnalyzer;
    this.config = config;
    
    // Edge-Konfiguration erstellen
    const edgeConfig = this.createEdgeConfiguration(baseUrl);
    
    // Edge-Komponenten initialisieren
    this.initializeEdgeComponents(edgeConfig);
    
    console.log('[EdgeVoiceClient] Initialisiert mit Edge Computing-Unterstützung');
  }

  // =============================================================================
  // Initialisierung
  // =============================================================================

  private createEdgeConfiguration(baseUrl: string): EdgeConfiguration {
    const edgeSettings = this.config.edge || {};
    
    return {
      mode: edgeSettings.mode || 'hybrid',
      latencyTargets: {
        local: edgeSettings.latencyTargets?.local || 20,
        edgeNode: edgeSettings.latencyTargets?.edgeNode || 50,
        hybrid: edgeSettings.latencyTargets?.hybrid || 100,
        cloudOnly: 200
      },
      availableNodes: this.createEdgeNodeInfos(edgeSettings.edgeNodes || []),
      adaptiveRouting: edgeSettings.adaptiveRouting !== false,
      cachingEnabled: edgeSettings.enableCaching !== false,
      fallbackConfig: {
        enabled: true,
        timeout: 5000,
        fallbackOrder: ['local', 'edge-node', 'cloud-only'],
        retryConfig: {
          maxRetries: 3,
          retryDelay: 1000,
          exponentialBackoff: true
        }
      }
    };
  }

  private createEdgeNodeInfos(nodeUrls: string[]): any[] {
    return nodeUrls.map((url, index) => ({
      nodeId: `edge-node-${index}`,
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
    }));
  }

  private async initializeEdgeComponents(edgeConfig: EdgeConfiguration): Promise<void> {
    try {
      // Distributed Processor initialisieren
      this.distributedProcessor = await createDistributedProcessor(edgeConfig);
      
      // Cache Manager initialisieren
      this.cacheManager = new EdgeCacheManager({
        modelCacheSize: 100 * 1024 * 1024, // 100MB
        resultCacheSize: 50 * 1024 * 1024,  // 50MB
        metadataCacheSize: 10 * 1024 * 1024  // 10MB
      });
      
      // Lokaler Audio Processor
      this.localProcessor = new EdgeAudioProcessor();
      await this.localProcessor.initialize();
      
      // Event Handlers einrichten
      this.setupEdgeEventHandlers();
      
      console.log('[EdgeVoiceClient] Edge-Komponenten initialisiert');
      
    } catch (error) {
      console.error('[EdgeVoiceClient] Fehler bei Edge-Initialisierung:', error);
      throw error;
    }
  }

  private setupEdgeEventHandlers(): void {
    // Distributed Processor Events
    this.distributedProcessor.on?.('task-completed', (data) => {
      this.emit('task-completed', data);
    });
    
    // Cache Manager Events
    this.cacheManager.on('cache-hit', (data) => {
      this.updateCachePerformance();
    });
    
    this.cacheManager.on('cache-miss', (data) => {
      this.updateCachePerformance();
    });
  }

  // =============================================================================
  // Public API - Kompatibel mit bestehender VoiceClient
  // =============================================================================

  async start(deviceId: string | null = null): Promise<void> {
    if (this.isStarted) {
      console.warn('[EdgeVoiceClient] Bereits gestartet');
      return;
    }

    try {
      console.log('[EdgeVoiceClient] Starte Edge-Enhanced Voice Client');
      
      this.currentDeviceId = deviceId;
      
      // Audio Context und Processing Setup
      await this.setupAudioProcessing(deviceId);
      
      // Performance Monitoring starten
      this.startPerformanceMonitoring();
      
      this.isStarted = true;
      
      console.log('[EdgeVoiceClient] Erfolgreich gestartet');
      
    } catch (error) {
      console.error('[EdgeVoiceClient] Fehler beim Starten:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    console.log('[EdgeVoiceClient] Stoppe Edge Voice Client');
    
    this.isStarted = false;
    
    // Performance Monitoring stoppen
    this.stopPerformanceMonitoring();
    
    // Audio Processing cleanup
    await this.cleanupAudioProcessing();
    
    // Edge-Komponenten cleanup
    await this.cleanupEdgeComponents();
    
    console.log('[EdgeVoiceClient] Gestoppt');
  }

  send(update: Update): void {
    if (!this.isStarted) {
      console.warn('[EdgeVoiceClient] Nicht gestartet, Message wird ignoriert');
      return;
    }

    // Message über optimalen Pfad senden
    this.sendOptimized(update).catch(error => {
      console.error('[EdgeVoiceClient] Fehler beim Senden der Message:', error);
    });
  }

  // =============================================================================
  // Edge-Enhanced Audio Processing
  // =============================================================================

  private async setupAudioProcessing(deviceId: string | null): Promise<void> {
    try {
      // Audio Context erstellen
      this.audioContext = new AudioContext({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });

      // Media Stream erstellen
      const constraints: MediaStreamConstraints = {
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined
        },
        video: false
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Edge Audio Worklet laden
      await this.audioContext.audioWorklet.addModule('/worklets/edge-audio-worklet.js');

      // Audio Processing Chain aufbauen
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Analyzer Node für Visualisierung
      this.analyzerNode = this.audioContext.createAnalyser();
      this.analyzerNode.fftSize = 256;
      this.setAnalyzer(this.analyzerNode);

      // Edge Audio Processor
      this.audioProcessor = new AudioWorkletNode(this.audioContext, 'edge-audio-processor', {
        processorOptions: {
          sampleRate: 48000,
          channelCount: 1,
          edgeProcessingEnabled: true
        }
      });

      // Audio Chain verbinden
      source.connect(this.analyzerNode);
      this.analyzerNode.connect(this.audioProcessor);

      // Audio-Daten-Handler
      this.audioProcessor.port.onmessage = (event) => {
        this.handleAudioData(event.data);
      };

      console.log('[EdgeVoiceClient] Edge Audio Processing Setup abgeschlossen');

    } catch (error) {
      console.error('[EdgeVoiceClient] Fehler beim Audio Processing Setup:', error);
      throw error;
    }
  }

  private async handleAudioData(data: any): Promise<void> {
    if (data.type === 'audio-data') {
      const audioData = new Float32Array(data.audioData);
      
      // Edge-optimierte Audio-Verarbeitung
      await this.processAudioWithEdge(audioData, data.metadata);
    }
  }

  private async processAudioWithEdge(
    audioData: Float32Array, 
    metadata: any
  ): Promise<void> {
    const startTime = performance.now();
    
    try {
      // Voice Activity Detection (lokal für niedrige Latenz)
      const hasVoice = await this.localProcessor.detectVoiceActivity(audioData);
      
      if (hasVoice) {
        // Audio Enhancement über Distributed Processor
        const enhancedAudio = await this.distributedProcessor.processAudioDistributed(
          audioData,
          'enhancement',
          {
            priority: 'high',
            deadline: new Date(Date.now() + 100) // 100ms deadline
          }
        );
        
        // Verarbeitete Audio-Daten senden
        await this.sendAudioData(enhancedAudio, metadata);
      }
      
      // Performance-Metriken aktualisieren
      const processingTime = performance.now() - startTime;
      this.updateLatencyMetrics(processingTime);
      
    } catch (error) {
      console.error('[EdgeVoiceClient] Fehler bei Edge Audio Processing:', error);
      
      // Fallback zu direkter Übertragung
      await this.sendAudioData(audioData, metadata);
    }
  }

  private async sendAudioData(audioData: Float32Array, metadata: any): Promise<void> {
    // Audio-Daten über optimalen Transport senden
    const update: Update = {
      type: 'audio-data',
      data: {
        audioData: Array.from(audioData),
        sampleRate: 48000,
        channels: 1,
        timestamp: Date.now(),
        metadata
      }
    };
    
    await this.sendOptimized(update);
  }

  private async sendOptimized(update: Update): Promise<void> {
    // Intelligente Routing-Entscheidung
    const processingMode = this.distributedProcessor.getProcessingMode();
    
    switch (processingMode) {
      case 'local':
        // Direkt über WebSocket/WebRTC senden
        await this.handleServerMessage(update);
        break;
        
      case 'edge-node':
        // Über Edge-Node routen
        await this.routeViaEdgeNode(update);
        break;
        
      case 'hybrid':
        // Intelligente Aufteilung
        await this.routeHybrid(update);
        break;
        
      default:
        // Fallback zu Standard-Verarbeitung
        await this.handleServerMessage(update);
    }
  }

  private async routeViaEdgeNode(update: Update): Promise<void> {
    try {
      // Update als Task an Edge-Node senden
      const task: DistributedTask = {
        taskId: `voice-${Date.now()}`,
        type: 'audio-processing',
        inputData: new TextEncoder().encode(JSON.stringify(update)),
        parameters: { type: 'voice-message' },
        dependencies: [],
        priority: 5,
        deadline: new Date(Date.now() + 1000), // 1 Sekunde
        partitionable: false
      };
      
      const taskId = await this.distributedProcessor.submitTask(task);
      const result = await this.distributedProcessor.getTaskResult(taskId, 2000);
      
      if (result.success) {
        // Verarbeitetes Update weiterleiten
        const processedUpdate = JSON.parse(new TextDecoder().decode(result.resultData));
        await this.handleServerMessage(processedUpdate);
      } else {
        throw new Error(result.error || 'Edge-Node-Verarbeitung fehlgeschlagen');
      }
      
    } catch (error) {
      console.warn('[EdgeVoiceClient] Edge-Node-Routing fehlgeschlagen, Fallback:', error);
      await this.handleServerMessage(update);
    }
  }

  private async routeHybrid(update: Update): Promise<void> {
    // Hybrid-Routing: Teile lokal, teile über Edge
    const dataSize = JSON.stringify(update).length;
    
    if (dataSize < 1024) {
      // Kleine Daten lokal verarbeiten
      await this.handleServerMessage(update);
    } else {
      // Große Daten über Edge-Node
      await this.routeViaEdgeNode(update);
    }
  }

  // =============================================================================
  // Performance Monitoring
  // =============================================================================

  private startPerformanceMonitoring(): void {
    this.performanceMonitorInterval = setInterval(() => {
      this.updatePerformanceMetrics();
    }, 1000); // Jede Sekunde
    
    console.log('[EdgeVoiceClient] Performance Monitoring gestartet');
  }

  private stopPerformanceMonitoring(): void {
    if (this.performanceMonitorInterval) {
      clearInterval(this.performanceMonitorInterval);
      this.performanceMonitorInterval = null;
    }
    
    console.log('[EdgeVoiceClient] Performance Monitoring gestoppt');
  }

  private updatePerformanceMetrics(): void {
    // Metriken von Distributed Processor holen
    const distributedMetrics = this.distributedProcessor.getPerformanceMetrics();
    
    // Cache-Metriken hinzufügen
    const cacheStats = this.cacheManager.getOverallStats();
    
    this.performanceMetrics = {
      ...distributedMetrics,
      cacheMetrics: {
        hitRate: cacheStats.overallHitRate,
        missRate: 1 - cacheStats.overallHitRate,
        evictionRate: 0, // Vereinfacht
        averageRetrievalTime: cacheStats.results.averageRetrievalTime
      }
    };
    
    this.emit('edge-performance-update', { metrics: this.performanceMetrics });
  }

  private updateLatencyMetrics(latency: number): void {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift();
    }
    
    // Latenz-Optimierung prüfen
    if (this.latencyHistory.length >= 10) {
      const avgLatency = this.latencyHistory.reduce((sum, lat) => sum + lat, 0) / this.latencyHistory.length;
      const targetLatency = this.config.edge?.latencyTargets?.local || 20;
      
      if (avgLatency > targetLatency * 1.5) {
        // Latenz zu hoch, Processing-Modus anpassen
        this.optimizeForLatency();
      }
    }
  }

  private optimizeForLatency(): void {
    const currentMode = this.distributedProcessor.getProcessingMode();
    let newMode: EdgeProcessingMode = currentMode;
    
    if (currentMode === 'hybrid') {
      newMode = 'local';
    } else if (currentMode === 'edge-node') {
      newMode = 'local';
    }
    
    if (newMode !== currentMode) {
      this.distributedProcessor.setProcessingMode(newMode);
      this.emit('processing-mode-changed', { 
        mode: newMode, 
        reason: 'latency-optimization' 
      });
      
      console.log(`[EdgeVoiceClient] Processing-Modus optimiert: ${currentMode} -> ${newMode}`);
    }
  }

  private updateCachePerformance(): void {
    const stats = this.cacheManager.getOverallStats();
    this.emit('cache-performance', {
      hitRate: stats.overallHitRate,
      averageRetrievalTime: stats.results.averageRetrievalTime
    });
  }

  // =============================================================================
  // Edge-spezifische Public API
  // =============================================================================

  getEdgePerformanceMetrics(): EdgePerformanceMetrics | null {
    return this.performanceMetrics;
  }

  getCurrentProcessingMode(): EdgeProcessingMode {
    return this.distributedProcessor.getProcessingMode();
  }

  setProcessingMode(mode: EdgeProcessingMode): void {
    this.distributedProcessor.setProcessingMode(mode);
    this.emit('processing-mode-changed', { mode, reason: 'manual-override' });
  }

  getAvailableEdgeNodes(): any[] {
    return this.distributedProcessor.getAvailableNodes();
  }

  async addEdgeNode(nodeUrl: string): Promise<void> {
    const nodeInfo = {
      nodeId: `edge-node-${Date.now()}`,
      type: 'audio-processor',
      endpoint: nodeUrl,
      region: 'auto-detect',
      latency: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      availableCapacity: 1.0,
      supportedFormats: ['float32', 'int16'],
      availableModels: ['vad-v1', 'noise-reduction-v2', 'enhancement-v1'],
      isHealthy: true,
      lastHealthCheck: new Date()
    };

    await this.distributedProcessor.addEdgeNode(nodeInfo);
    console.log(`[EdgeVoiceClient] Edge-Node hinzugefügt: ${nodeUrl}`);
  }

  async removeEdgeNode(nodeId: string): Promise<void> {
    await this.distributedProcessor.removeEdgeNode(nodeId);
    console.log(`[EdgeVoiceClient] Edge-Node entfernt: ${nodeId}`);
  }

  getCacheStats(): any {
    return this.cacheManager.getOverallStats();
  }

  clearCache(type?: 'models' | 'results' | 'metadata'): void {
    this.cacheManager.clearCache(type);
    console.log(`[EdgeVoiceClient] Cache geleert: ${type || 'alle'}`);
  }

  getTaskQueueStatus(): any {
    return this.distributedProcessor.getTaskQueueStatus();
  }

  // =============================================================================
  // Event Management
  // =============================================================================

  on<K extends keyof EdgeVoiceClientEvents>(
    event: K,
    listener: (data: EdgeVoiceClientEvents[K]) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off<K extends keyof EdgeVoiceClientEvents>(
    event: K,
    listener: (data: EdgeVoiceClientEvents[K]) => void
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  private emit<K extends keyof EdgeVoiceClientEvents>(
    event: K,
    data: EdgeVoiceClientEvents[K]
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[EdgeVoiceClient] Fehler in Event Listener für ${event}:`, error);
        }
      });
    }
  }

  // =============================================================================
  // Cleanup
  // =============================================================================

  private async cleanupAudioProcessing(): Promise<void> {
    // Media Stream stoppen
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Audio Context schließen
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    // Nodes cleanup
    this.audioProcessor = null;
    this.analyzerNode = null;

    console.log('[EdgeVoiceClient] Audio Processing Cleanup abgeschlossen');
  }

  private async cleanupEdgeComponents(): Promise<void> {
    // Distributed Processor cleanup
    if (this.distributedProcessor) {
      await this.distributedProcessor.cleanup();
    }

    // Cache Manager cleanup
    if (this.cacheManager) {
      await this.cacheManager.cleanup();
    }

    // Local Processor cleanup
    if (this.localProcessor) {
      await this.localProcessor.cleanup();
    }

    // Event Listeners cleanup
    this.listeners.clear();

    console.log('[EdgeVoiceClient] Edge-Komponenten Cleanup abgeschlossen');
  }

  // =============================================================================
  // Utility Methods
  // =============================================================================

  isConnected(): boolean {
    return this.isStarted;
  }

  getLatencyHistory(): number[] {
    return [...this.latencyHistory];
  }

  getAverageLatency(): number {
    if (this.latencyHistory.length === 0) return 0;
    return this.latencyHistory.reduce((sum, lat) => sum + lat, 0) / this.latencyHistory.length;
  }

  getOptimalProcessingMode(): EdgeProcessingMode {
    const avgLatency = this.getAverageLatency();
    const targets = this.config.edge?.latencyTargets;

    if (!targets) return 'local';

    if (avgLatency <= targets.local) {
      return 'local';
    } else if (avgLatency <= targets.edgeNode) {
      return 'edge-node';
    } else if (avgLatency <= targets.hybrid) {
      return 'hybrid';
    } else {
      return 'local'; // Fallback bei hoher Latenz
    }
  }

  async optimizePerformance(): Promise<void> {
    const optimalMode = this.getOptimalProcessingMode();
    const currentMode = this.getCurrentProcessingMode();

    if (optimalMode !== currentMode) {
      this.setProcessingMode(optimalMode);
      console.log(`[EdgeVoiceClient] Performance optimiert: ${currentMode} -> ${optimalMode}`);
    }

    // Cache-Optimierung
    const cacheStats = this.getCacheStats();
    if (cacheStats.overallHitRate < 0.5) {
      // Prefetch populäre Modelle
      await this.cacheManager.prefetchPopularModels([
        'vad-v1', 'noise-reduction-v2', 'enhancement-v1'
      ]);
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export async function createEdgeVoiceClient(
  baseUrl: string,
  handleServerMessage: (update: Update) => Promise<void>,
  setAnalyzer: (analyzer: AnalyserNode) => void,
  config: EdgeVoiceConfiguration
): Promise<EdgeVoiceClient> {
  const client = new EdgeVoiceClient(baseUrl, handleServerMessage, setAnalyzer, config);

  // Auto-Optimierung aktivieren falls konfiguriert
  if (config.edge?.adaptiveRouting !== false) {
    setInterval(() => {
      client.optimizePerformance().catch(error => {
        console.warn('[EdgeVoiceClient] Auto-Optimierung fehlgeschlagen:', error);
      });
    }, 30000); // Alle 30 Sekunden
  }

  return client;
}
