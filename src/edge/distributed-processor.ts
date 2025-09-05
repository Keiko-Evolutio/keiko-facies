/**
 * Distributed Computing Framework für Edge Audio Processing
 * 
 * Verteilt Audio-Verarbeitungsaufgaben zwischen lokalen WASM-Modulen,
 * Edge-Nodes und zentralem Server für optimale Latenz und Durchsatz.
 * 
 * @version 1.0.0
 */

import type {
  DistributedTask,
  TaskPartition,
  TaskResult,
  EdgeProcessingMode,
  EdgeConfiguration,
  EdgeInferenceRequest,
  EdgeInferenceResponse,
  EdgePerformanceMetrics,
  DistributedTaskError
} from './types';
import { EdgeNodeManager } from './edge-node-manager';
import { EdgeAudioProcessor } from './wasm/audio-processor';

// =============================================================================
// Task Scheduler
// =============================================================================

class TaskScheduler {
  private pendingTasks: Map<string, DistributedTask> = new Map();
  private runningTasks: Map<string, DistributedTask> = new Map();
  private completedTasks: Map<string, TaskResult> = new Map();
  private taskQueue: DistributedTask[] = [];
  private maxConcurrentTasks: number = 10;

  scheduleTask(task: DistributedTask): void {
    this.pendingTasks.set(task.taskId, task);
    
    // Task in Queue einreihen (sortiert nach Priorität und Deadline)
    this.taskQueue.push(task);
    this.taskQueue.sort((a, b) => {
      // Höhere Priorität zuerst
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Frühere Deadline zuerst
      return a.deadline.getTime() - b.deadline.getTime();
    });

    console.log(`[TaskScheduler] Task geplant: ${task.taskId} (Priorität: ${task.priority})`);
  }

  getNextTask(): DistributedTask | null {
    // Prüfe ob Kapazität für neue Tasks vorhanden
    if (this.runningTasks.size >= this.maxConcurrentTasks) {
      return null;
    }

    // Prüfe Abhängigkeiten und hole nächste ausführbare Task
    for (let i = 0; i < this.taskQueue.length; i++) {
      const task = this.taskQueue[i];
      
      if (this.areDependenciesSatisfied(task)) {
        // Task aus Queue entfernen und als laufend markieren
        this.taskQueue.splice(i, 1);
        this.pendingTasks.delete(task.taskId);
        this.runningTasks.set(task.taskId, task);
        
        return task;
      }
    }

    return null;
  }

  completeTask(taskId: string, result: TaskResult): void {
    const task = this.runningTasks.get(taskId);
    if (!task) {
      console.warn(`[TaskScheduler] Task ${taskId} nicht in laufenden Tasks gefunden`);
      return;
    }

    this.runningTasks.delete(taskId);
    this.completedTasks.set(taskId, result);

    console.log(`[TaskScheduler] Task abgeschlossen: ${taskId} (${result.processingTime.toFixed(2)}ms)`);
  }

  failTask(taskId: string, error: string): void {
    const task = this.runningTasks.get(taskId);
    if (!task) {
      console.warn(`[TaskScheduler] Task ${taskId} nicht in laufenden Tasks gefunden`);
      return;
    }

    this.runningTasks.delete(taskId);
    
    const result: TaskResult = {
      taskId,
      processingTime: 0,
      resultData: new ArrayBuffer(0),
      success: false,
      error,
      resourceUsage: { cpu: 0, memory: 0, bandwidth: 0 }
    };
    
    this.completedTasks.set(taskId, result);
    console.error(`[TaskScheduler] Task fehlgeschlagen: ${taskId} - ${error}`);
  }

  private areDependenciesSatisfied(task: DistributedTask): boolean {
    return task.dependencies.every(depId => this.completedTasks.has(depId));
  }

  getTaskStatus(taskId: string): 'pending' | 'running' | 'completed' | 'not-found' {
    if (this.pendingTasks.has(taskId) || this.taskQueue.some(t => t.taskId === taskId)) {
      return 'pending';
    }
    if (this.runningTasks.has(taskId)) {
      return 'running';
    }
    if (this.completedTasks.has(taskId)) {
      return 'completed';
    }
    return 'not-found';
  }

  getQueueLength(): number {
    return this.taskQueue.length;
  }

  getRunningTaskCount(): number {
    return this.runningTasks.size;
  }
}

// =============================================================================
// Task Partitioner
// =============================================================================

class TaskPartitioner {
  partitionTask(task: DistributedTask, availableNodes: number): TaskPartition[] {
    if (!task.partitionable || availableNodes <= 1) {
      // Task nicht partitionierbar oder nur eine Node verfügbar
      return [{
        partitionId: `${task.taskId}-0`,
        parentTaskId: task.taskId,
        data: task.inputData,
        index: 0,
        totalPartitions: 1,
        targetNode: ''
      }];
    }

    // Audio-Daten partitionieren
    const partitions: TaskPartition[] = [];
    const dataSize = task.inputData.byteLength;
    const partitionSize = Math.ceil(dataSize / availableNodes);

    for (let i = 0; i < availableNodes; i++) {
      const start = i * partitionSize;
      const end = Math.min(start + partitionSize, dataSize);
      
      if (start >= dataSize) break;

      const partitionData = task.inputData.slice(start, end);
      
      partitions.push({
        partitionId: `${task.taskId}-${i}`,
        parentTaskId: task.taskId,
        data: partitionData,
        index: i,
        totalPartitions: availableNodes,
        targetNode: '' // Wird vom Scheduler zugewiesen
      });
    }

    console.log(`[TaskPartitioner] Task ${task.taskId} in ${partitions.length} Partitionen aufgeteilt`);
    return partitions;
  }

  mergeResults(partitions: TaskPartition[], results: TaskResult[]): TaskResult {
    if (results.length === 0) {
      throw new Error('Keine Ergebnisse zum Zusammenführen vorhanden');
    }

    // Ergebnisse nach Partition-Index sortieren
    const sortedResults = results.sort((a, b) => {
      const aIndex = parseInt(a.taskId.split('-').pop() || '0');
      const bIndex = parseInt(b.taskId.split('-').pop() || '0');
      return aIndex - bIndex;
    });

    // Daten zusammenführen
    const totalSize = sortedResults.reduce((sum, result) => sum + result.resultData.byteLength, 0);
    const mergedData = new ArrayBuffer(totalSize);
    const mergedView = new Uint8Array(mergedData);

    let offset = 0;
    for (const result of sortedResults) {
      const resultView = new Uint8Array(result.resultData);
      mergedView.set(resultView, offset);
      offset += resultView.length;
    }

    // Aggregierte Metriken berechnen
    const totalProcessingTime = Math.max(...sortedResults.map(r => r.processingTime));
    const avgResourceUsage = {
      cpu: sortedResults.reduce((sum, r) => sum + r.resourceUsage.cpu, 0) / sortedResults.length,
      memory: sortedResults.reduce((sum, r) => sum + r.resourceUsage.memory, 0) / sortedResults.length,
      bandwidth: sortedResults.reduce((sum, r) => sum + r.resourceUsage.bandwidth, 0) / sortedResults.length
    };

    return {
      taskId: partitions[0].parentTaskId,
      processingTime: totalProcessingTime,
      resultData: mergedData,
      success: sortedResults.every(r => r.success),
      error: sortedResults.find(r => !r.success)?.error,
      resourceUsage: avgResourceUsage
    };
  }
}

// =============================================================================
// Distributed Processor
// =============================================================================

export class DistributedProcessor {
  private edgeNodeManager: EdgeNodeManager;
  private localProcessor: EdgeAudioProcessor;
  private taskScheduler: TaskScheduler;
  private taskPartitioner: TaskPartitioner;
  private config: EdgeConfiguration;
  private performanceMetrics: EdgePerformanceMetrics;
  private processingMode: EdgeProcessingMode = 'hybrid';

  constructor(config: EdgeConfiguration) {
    this.config = config;
    this.edgeNodeManager = new EdgeNodeManager(config);
    this.localProcessor = new EdgeAudioProcessor();
    this.taskScheduler = new TaskScheduler();
    this.taskPartitioner = new TaskPartitioner();
    
    this.initializePerformanceMetrics();
    this.startProcessingLoop();

    console.log('[DistributedProcessor] Initialisiert mit Modus:', config.mode);
  }

  // =============================================================================
  // Public API
  // =============================================================================

  async initialize(): Promise<void> {
    // Lokalen WASM-Processor initialisieren
    await this.localProcessor.initialize();
    
    console.log('[DistributedProcessor] Initialisierung abgeschlossen');
  }

  async processAudioDistributed(
    audioData: Float32Array,
    processingType: 'vad' | 'noise-reduction' | 'enhancement' | 'analysis',
    options: {
      priority?: number;
      deadline?: Date;
      forceLocal?: boolean;
      forceEdge?: boolean;
    } = {}
  ): Promise<Float32Array | any> {
    const startTime = performance.now();
    
    // Processing-Modus bestimmen
    const mode = this.determineProcessingMode(audioData, processingType, options);
    
    try {
      let result: any;
      
      switch (mode) {
        case 'local':
          result = await this.processLocally(audioData, processingType);
          break;
          
        case 'edge-node':
          result = await this.processOnEdgeNode(audioData, processingType, options);
          break;
          
        case 'hybrid':
          result = await this.processHybrid(audioData, processingType, options);
          break;
          
        case 'cloud-only':
          result = await this.processOnCloud(audioData, processingType, options);
          break;
          
        default:
          throw new Error(`Unbekannter Processing-Modus: ${mode}`);
      }

      // Performance-Metriken aktualisieren
      const processingTime = performance.now() - startTime;
      this.updatePerformanceMetrics(mode, processingTime, audioData.length);

      return result;

    } catch (error) {
      console.error(`[DistributedProcessor] Fehler bei ${mode}-Processing:`, error);
      
      // Fallback-Verarbeitung
      if (mode !== 'local') {
        console.log('[DistributedProcessor] Fallback zu lokaler Verarbeitung');
        return this.processLocally(audioData, processingType);
      }
      
      throw error;
    }
  }

  async submitTask(task: DistributedTask): Promise<string> {
    this.taskScheduler.scheduleTask(task);
    return task.taskId;
  }

  async getTaskResult(taskId: string, timeout: number = 30000): Promise<TaskResult> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const status = this.taskScheduler.getTaskStatus(taskId);
      
      if (status === 'completed') {
        const result = this.taskScheduler['completedTasks'].get(taskId);
        if (result) {
          return result;
        }
      } else if (status === 'not-found') {
        throw new DistributedTaskError('Task nicht gefunden', taskId);
      }
      
      // Kurz warten bevor erneut prüfen
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new DistributedTaskError('Task-Timeout erreicht', taskId, { timeout });
  }

  // =============================================================================
  // Processing Modes
  // =============================================================================

  private determineProcessingMode(
    audioData: Float32Array,
    processingType: string,
    options: any
  ): EdgeProcessingMode {
    if (options.forceLocal) return 'local';
    if (options.forceEdge) return 'edge-node';
    
    // Adaptive Modus-Auswahl basierend auf verschiedenen Faktoren
    const dataSize = audioData.length * 4; // Float32 = 4 bytes
    const availableNodes = this.edgeNodeManager.getAvailableNodes();
    const localCapacity = this.getLocalProcessingCapacity();
    
    // Kleine Daten oder keine Edge-Nodes verfügbar -> lokal
    if (dataSize < 1024 || availableNodes.length === 0 || localCapacity > 0.8) {
      return 'local';
    }
    
    // Einfache Operationen -> Edge-Node
    if (processingType === 'vad' || processingType === 'noise-reduction') {
      return 'edge-node';
    }
    
    // Komplexe Operationen -> Hybrid
    if (processingType === 'analysis' || dataSize > 10240) {
      return 'hybrid';
    }
    
    // Standard -> Edge-Node
    return 'edge-node';
  }

  private async processLocally(audioData: Float32Array, processingType: string): Promise<any> {
    switch (processingType) {
      case 'vad':
        return this.localProcessor.detectVoiceActivity(audioData);
      case 'noise-reduction':
        return this.localProcessor.reduceNoise(audioData);
      case 'enhancement':
        return this.localProcessor.enhanceAudio(audioData);
      case 'analysis':
        return this.localProcessor.analyzeSpectrum(audioData);
      default:
        return this.localProcessor.processAudio(audioData, 48000);
    }
  }

  private async processOnEdgeNode(
    audioData: Float32Array,
    processingType: string,
    options: any
  ): Promise<any> {
    const request: EdgeInferenceRequest = {
      requestId: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      modelId: this.getModelIdForProcessingType(processingType),
      inputData: audioData.buffer,
      inputMetadata: {
        sampleRate: 48000,
        channels: 1,
        duration: audioData.length / 48000,
        format: 'float32'
      },
      processingParams: { type: processingType },
      priority: options.priority || 'normal',
      timeout: 5000
    };

    const response = await this.edgeNodeManager.routeRequest(request);
    
    if (!response.success) {
      throw new Error(`Edge-Node-Processing fehlgeschlagen: ${response.error}`);
    }

    return response.resultData;
  }

  private async processHybrid(
    audioData: Float32Array,
    processingType: string,
    options: any
  ): Promise<any> {
    // Hybrid-Processing: Aufteilen zwischen lokal und Edge
    const halfSize = Math.floor(audioData.length / 2);
    const firstHalf = audioData.slice(0, halfSize);
    const secondHalf = audioData.slice(halfSize);

    // Parallel verarbeiten
    const [localResult, edgeResult] = await Promise.all([
      this.processLocally(firstHalf, processingType),
      this.processOnEdgeNode(secondHalf, processingType, options)
    ]);

    // Ergebnisse zusammenführen
    if (processingType === 'vad') {
      return localResult || edgeResult; // Boolean OR
    } else if (localResult instanceof Float32Array && edgeResult instanceof Float32Array) {
      // Audio-Daten zusammenführen
      const combined = new Float32Array(audioData.length);
      combined.set(localResult, 0);
      combined.set(edgeResult, halfSize);
      return combined;
    } else {
      // Andere Datentypen - verwende Edge-Ergebnis
      return edgeResult;
    }
  }

  private async processOnCloud(
    audioData: Float32Array,
    processingType: string,
    options: any
  ): Promise<any> {
    // Cloud-Processing über zentralen Server
    // Implementierung würde HTTP-Request an Backend senden
    throw new Error('Cloud-Processing noch nicht implementiert');
  }

  // =============================================================================
  // Processing Loop
  // =============================================================================

  private startProcessingLoop(): void {
    setInterval(() => {
      this.processNextTask();
    }, 100); // Alle 100ms prüfen
  }

  private async processNextTask(): Promise<void> {
    const task = this.taskScheduler.getNextTask();
    if (!task) return;

    try {
      // Task partitionieren falls möglich
      const availableNodes = this.edgeNodeManager.getAvailableNodes().length;
      const partitions = this.taskPartitioner.partitionTask(task, availableNodes);

      if (partitions.length === 1) {
        // Einzelne Partition verarbeiten
        const result = await this.processSinglePartition(partitions[0], task);
        this.taskScheduler.completeTask(task.taskId, result);
      } else {
        // Multiple Partitionen parallel verarbeiten
        const results = await this.processMultiplePartitions(partitions, task);
        const mergedResult = this.taskPartitioner.mergeResults(partitions, results);
        this.taskScheduler.completeTask(task.taskId, mergedResult);
      }

    } catch (error) {
      this.taskScheduler.failTask(task.taskId, error instanceof Error ? error.message : String(error));
    }
  }

  private async processSinglePartition(partition: TaskPartition, task: DistributedTask): Promise<TaskResult> {
    const startTime = performance.now();
    
    // Verarbeitung basierend auf Task-Type
    const audioData = new Float32Array(partition.data);
    let resultData: ArrayBuffer;

    switch (task.type) {
      case 'audio-processing':
        const processed = await this.processLocally(audioData, 'enhancement');
        resultData = processed.buffer;
        break;
      case 'ai-inference':
        const inference = await this.processOnEdgeNode(audioData, 'analysis', {});
        resultData = new ArrayBuffer(0); // Placeholder
        break;
      default:
        resultData = partition.data;
    }

    return {
      taskId: partition.partitionId,
      processingTime: performance.now() - startTime,
      resultData,
      success: true,
      resourceUsage: {
        cpu: 0.1,
        memory: partition.data.byteLength / 1024 / 1024, // MB
        bandwidth: 0
      }
    };
  }

  private async processMultiplePartitions(
    partitions: TaskPartition[],
    task: DistributedTask
  ): Promise<TaskResult[]> {
    // Partitionen parallel verarbeiten
    const promises = partitions.map(partition => this.processSinglePartition(partition, task));
    return Promise.all(promises);
  }

  // =============================================================================
  // Utility Methods
  // =============================================================================

  private getModelIdForProcessingType(processingType: string): string {
    const modelMap: Record<string, string> = {
      'vad': 'voice-activity-detection-v1',
      'noise-reduction': 'noise-reduction-v2',
      'enhancement': 'audio-enhancement-v1',
      'analysis': 'spectral-analysis-v1'
    };

    return modelMap[processingType] || 'general-audio-processing-v1';
  }

  private getLocalProcessingCapacity(): number {
    // Vereinfachte Kapazitäts-Schätzung basierend auf Browser-Performance
    const performanceEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const loadTime = performanceEntry ? performanceEntry.loadEventEnd - performanceEntry.navigationStart : 1000;

    // Niedrigere Load-Zeit = höhere Kapazität
    return Math.max(0, Math.min(1, 1 - (loadTime / 5000))); // 5s = 0% Kapazität
  }

  private initializePerformanceMetrics(): void {
    this.performanceMetrics = {
      latency: {
        local: 0,
        edgeNode: 0,
        hybrid: 0,
        cloudOnly: 0,
        p50: 0,
        p95: 0,
        p99: 0
      },
      throughput: {
        requestsPerSecond: 0,
        bytesPerSecond: 0,
        tasksPerSecond: 0
      },
      resourceUsage: {
        cpu: 0,
        memory: 0,
        bandwidth: 0,
        storage: 0
      },
      successRates: {
        overall: 1.0,
        byProcessingMode: new Map([
          ['local', 1.0],
          ['edge-node', 1.0],
          ['hybrid', 1.0],
          ['cloud-only', 1.0]
        ]),
        byNodeType: new Map()
      },
      cacheMetrics: {
        hitRate: 0,
        missRate: 0,
        evictionRate: 0,
        averageRetrievalTime: 0
      }
    };
  }

  private updatePerformanceMetrics(mode: EdgeProcessingMode, processingTime: number, dataSize: number): void {
    // Latenz-Metriken aktualisieren
    this.performanceMetrics.latency[mode] = processingTime;

    // Durchsatz berechnen
    const bytesPerSecond = (dataSize * 4) / (processingTime / 1000); // Float32 = 4 bytes
    this.performanceMetrics.throughput.bytesPerSecond = bytesPerSecond;

    // Erfolgsrate aktualisieren
    const currentRate = this.performanceMetrics.successRates.byProcessingMode.get(mode) || 1.0;
    this.performanceMetrics.successRates.byProcessingMode.set(mode, Math.min(1.0, currentRate + 0.01));

    console.debug(`[DistributedProcessor] ${mode}: ${processingTime.toFixed(2)}ms, ${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`);
  }

  // =============================================================================
  // Public API
  // =============================================================================

  setProcessingMode(mode: EdgeProcessingMode): void {
    this.processingMode = mode;
    console.log(`[DistributedProcessor] Processing-Modus geändert zu: ${mode}`);
  }

  getProcessingMode(): EdgeProcessingMode {
    return this.processingMode;
  }

  getPerformanceMetrics(): EdgePerformanceMetrics {
    // Aktuelle Metriken von Edge Node Manager einbeziehen
    const edgeMetrics = this.edgeNodeManager.getPerformanceMetrics();

    return {
      ...this.performanceMetrics,
      latency: {
        ...this.performanceMetrics.latency,
        edgeNode: edgeMetrics.latency.edgeNode,
        p50: edgeMetrics.latency.p50,
        p95: edgeMetrics.latency.p95,
        p99: edgeMetrics.latency.p99
      },
      resourceUsage: {
        ...this.performanceMetrics.resourceUsage,
        cpu: edgeMetrics.resourceUsage.cpu,
        memory: edgeMetrics.resourceUsage.memory
      }
    };
  }

  getTaskQueueStatus(): {
    pending: number;
    running: number;
    completed: number;
  } {
    return {
      pending: this.taskScheduler.getQueueLength(),
      running: this.taskScheduler.getRunningTaskCount(),
      completed: this.taskScheduler['completedTasks'].size
    };
  }

  getAvailableNodes(): any[] {
    return this.edgeNodeManager.getAvailableNodes();
  }

  async addEdgeNode(nodeInfo: any): Promise<void> {
    this.edgeNodeManager.addNode(nodeInfo);
  }

  async removeEdgeNode(nodeId: string): Promise<void> {
    this.edgeNodeManager.removeNode(nodeId);
  }

  async cleanup(): Promise<void> {
    await this.localProcessor.cleanup();
    await this.edgeNodeManager.cleanup();

    console.log('[DistributedProcessor] Cleanup abgeschlossen');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export async function createDistributedProcessor(config: EdgeConfiguration): Promise<DistributedProcessor> {
  const processor = new DistributedProcessor(config);
  await processor.initialize();
  return processor;
}
