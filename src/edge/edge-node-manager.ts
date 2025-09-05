/**
 * Edge Node Manager für verteilte Audio-Verarbeitung
 * 
 * Verwaltet Edge-Nodes, Load Balancing und adaptive Routing.
 * Optimiert für <50ms Edge-Node-Latenz und intelligente Lastverteilung.
 * 
 * @version 1.0.0
 */

import type {
  EdgeNodeInfo,
  EdgeConfiguration,
  RoutingDecision,
  LoadBalancingStrategy,
  EdgeInferenceRequest,
  EdgeInferenceResponse,
  EdgePerformanceMetrics,
  EdgeHealthStatus,
  EdgeAlert,
  EdgeEventMap,
  EdgeNodeError,
  RoutingError
} from './types';

// =============================================================================
// Edge Node Client
// =============================================================================

class EdgeNodeClient {
  private nodeInfo: EdgeNodeInfo;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private performanceHistory: number[] = [];
  private lastRequestTime: number = 0;
  private consecutiveFailures: number = 0;

  constructor(nodeInfo: EdgeNodeInfo) {
    this.nodeInfo = { ...nodeInfo };
    this.startHealthChecking();
  }

  // =============================================================================
  // Request Processing
  // =============================================================================

  async processRequest(request: EdgeInferenceRequest): Promise<EdgeInferenceResponse> {
    const startTime = performance.now();
    this.lastRequestTime = startTime;

    try {
      // Request an Edge-Node senden
      const response = await this.sendRequest(request);
      
      // Performance-Metriken aktualisieren
      const processingTime = performance.now() - startTime;
      this.updatePerformanceMetrics(processingTime);
      
      // Erfolgreiche Verarbeitung
      this.consecutiveFailures = 0;
      
      return {
        ...response,
        processingTime,
        processedBy: this.nodeInfo.nodeId
      };

    } catch (error) {
      this.consecutiveFailures++;
      
      // Node als ungesund markieren bei wiederholten Fehlern
      if (this.consecutiveFailures >= 3) {
        this.nodeInfo.isHealthy = false;
      }

      throw new EdgeNodeError(
        `Edge-Node-Request fehlgeschlagen: ${error}`,
        this.nodeInfo.nodeId,
        { request, error, consecutiveFailures: this.consecutiveFailures }
      );
    }
  }

  private async sendRequest(request: EdgeInferenceRequest): Promise<EdgeInferenceResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeout);

    try {
      const response = await fetch(`${this.nodeInfo.endpoint}/inference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': request.requestId,
          'X-Model-ID': request.modelId,
          'X-Priority': request.priority
        },
        body: JSON.stringify({
          modelId: request.modelId,
          inputData: Array.from(new Uint8Array(request.inputData as ArrayBuffer)),
          inputMetadata: request.inputMetadata,
          processingParams: request.processingParams
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        requestId: request.requestId,
        processingTime: 0, // Wird vom Caller gesetzt
        success: true,
        resultData: result.resultData,
        confidence: result.confidence || 1.0,
        processedBy: this.nodeInfo.nodeId,
        metadata: result.metadata || {}
      };

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }

  // =============================================================================
  // Health Monitoring
  // =============================================================================

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Alle 30 Sekunden
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const startTime = performance.now();
      
      const response = await fetch(`${this.nodeInfo.endpoint}/health`, {
        method: 'GET',
        timeout: 5000
      });

      const healthData = await response.json();
      const latency = performance.now() - startTime;

      // Node-Informationen aktualisieren
      this.nodeInfo.latency = latency;
      this.nodeInfo.cpuUsage = healthData.cpuUsage || 0;
      this.nodeInfo.memoryUsage = healthData.memoryUsage || 0;
      this.nodeInfo.availableCapacity = 1 - Math.max(healthData.cpuUsage || 0, healthData.memoryUsage || 0);
      this.nodeInfo.isHealthy = response.ok && latency < 1000; // <1s für Health Check
      this.nodeInfo.lastHealthCheck = new Date();

      // Consecutive Failures zurücksetzen bei erfolgreichem Health Check
      if (this.nodeInfo.isHealthy) {
        this.consecutiveFailures = 0;
      }

    } catch (error) {
      console.warn(`[EdgeNodeClient] Health Check fehlgeschlagen für ${this.nodeInfo.nodeId}:`, error);
      this.nodeInfo.isHealthy = false;
      this.nodeInfo.lastHealthCheck = new Date();
      this.consecutiveFailures++;
    }
  }

  private updatePerformanceMetrics(processingTime: number): void {
    // Performance-Historie aktualisieren (letzte 100 Requests)
    this.performanceHistory.push(processingTime);
    if (this.performanceHistory.length > 100) {
      this.performanceHistory.shift();
    }

    // Durchschnittliche Latenz berechnen
    if (this.performanceHistory.length > 0) {
      const avgLatency = this.performanceHistory.reduce((sum, time) => sum + time, 0) / this.performanceHistory.length;
      this.nodeInfo.latency = avgLatency;
    }
  }

  // =============================================================================
  // Public API
  // =============================================================================

  getNodeInfo(): EdgeNodeInfo {
    return { ...this.nodeInfo };
  }

  getPerformanceHistory(): number[] {
    return [...this.performanceHistory];
  }

  isAvailable(): boolean {
    return this.nodeInfo.isHealthy && this.nodeInfo.availableCapacity > 0.1; // Mindestens 10% Kapazität
  }

  getScore(weights: { latency: number; capacity: number; reliability: number }): number {
    if (!this.isAvailable()) return 0;

    // Normalisierte Scores (0-1, höher = besser)
    const latencyScore = Math.max(0, 1 - (this.nodeInfo.latency / 1000)); // <1s = gut
    const capacityScore = this.nodeInfo.availableCapacity;
    const reliabilityScore = Math.max(0, 1 - (this.consecutiveFailures / 10)); // <10 Fehler = gut

    return (
      latencyScore * weights.latency +
      capacityScore * weights.capacity +
      reliabilityScore * weights.reliability
    ) / (weights.latency + weights.capacity + weights.reliability);
  }

  cleanup(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

// =============================================================================
// Edge Node Manager
// =============================================================================

export class EdgeNodeManager {
  private nodes: Map<string, EdgeNodeClient> = new Map();
  private loadBalancingStrategy: LoadBalancingStrategy;
  private performanceMetrics: EdgePerformanceMetrics;
  private healthStatus: EdgeHealthStatus;
  private listeners: Map<string, Function[]> = new Map();
  private routingHistory: RoutingDecision[] = [];
  private adaptiveLearning: boolean = true;

  constructor(config: EdgeConfiguration) {
    this.loadBalancingStrategy = {
      name: 'adaptive',
      weights: {
        latency: 0.4,
        capacity: 0.3,
        reliability: 0.2,
        cost: 0.1
      },
      adaptiveParams: {
        learningRate: 0.1,
        explorationRate: 0.1,
        decayFactor: 0.95
      }
    };

    this.initializeMetrics();
    this.initializeHealthStatus();
    
    // Verfügbare Nodes registrieren
    config.availableNodes.forEach(nodeInfo => {
      this.addNode(nodeInfo);
    });

    console.log(`[EdgeNodeManager] Initialisiert mit ${this.nodes.size} Edge-Nodes`);
  }

  // =============================================================================
  // Node Management
  // =============================================================================

  addNode(nodeInfo: EdgeNodeInfo): void {
    if (this.nodes.has(nodeInfo.nodeId)) {
      console.warn(`[EdgeNodeManager] Node ${nodeInfo.nodeId} bereits registriert`);
      return;
    }

    const nodeClient = new EdgeNodeClient(nodeInfo);
    this.nodes.set(nodeInfo.nodeId, nodeClient);
    
    this.emit('node-added', { node: nodeInfo });
    console.log(`[EdgeNodeManager] Node hinzugefügt: ${nodeInfo.nodeId} (${nodeInfo.endpoint})`);
  }

  removeNode(nodeId: string): void {
    const nodeClient = this.nodes.get(nodeId);
    if (!nodeClient) {
      console.warn(`[EdgeNodeManager] Node ${nodeId} nicht gefunden`);
      return;
    }

    nodeClient.cleanup();
    this.nodes.delete(nodeId);
    
    this.emit('node-removed', { nodeId });
    console.log(`[EdgeNodeManager] Node entfernt: ${nodeId}`);
  }

  getAvailableNodes(): EdgeNodeInfo[] {
    return Array.from(this.nodes.values())
      .filter(client => client.isAvailable())
      .map(client => client.getNodeInfo());
  }

  getNodeById(nodeId: string): EdgeNodeInfo | null {
    const nodeClient = this.nodes.get(nodeId);
    return nodeClient ? nodeClient.getNodeInfo() : null;
  }

  // =============================================================================
  // Request Routing
  // =============================================================================

  async routeRequest(request: EdgeInferenceRequest): Promise<EdgeInferenceResponse> {
    // Routing-Entscheidung treffen
    const routingDecision = this.makeRoutingDecision(request);
    
    if (!routingDecision.selectedNode) {
      throw new RoutingError('Keine verfügbaren Edge-Nodes gefunden', {
        requestId: request.requestId,
        modelId: request.modelId
      });
    }

    // Request an gewählte Node weiterleiten
    const nodeClient = this.nodes.get(routingDecision.selectedNode.nodeId);
    if (!nodeClient) {
      throw new RoutingError(`Edge-Node ${routingDecision.selectedNode.nodeId} nicht verfügbar`, {
        requestId: request.requestId
      });
    }

    try {
      const response = await nodeClient.processRequest(request);
      
      // Routing-Entscheidung in Historie speichern
      this.routingHistory.push(routingDecision);
      if (this.routingHistory.length > 1000) {
        this.routingHistory.shift();
      }

      // Adaptive Learning aktualisieren
      if (this.adaptiveLearning) {
        this.updateAdaptiveLearning(routingDecision, response);
      }

      this.emit('routing-decision', { decision: routingDecision });
      return response;

    } catch (error) {
      // Fehler-Feedback für Adaptive Learning
      if (this.adaptiveLearning) {
        this.updateAdaptiveLearning(routingDecision, null, error as Error);
      }

      throw error;
    }
  }

  private makeRoutingDecision(request: EdgeInferenceRequest): RoutingDecision {
    const availableNodes = this.getAvailableNodes();
    
    if (availableNodes.length === 0) {
      return {
        selectedNode: null as any,
        reason: 'fallback',
        expectedLatency: Infinity,
        confidence: 0,
        alternatives: []
      };
    }

    // Nodes nach Eignung für Request filtern
    const suitableNodes = availableNodes.filter(node => {
      return node.availableModels.includes(request.modelId) ||
             node.type === 'ai-inference';
    });

    if (suitableNodes.length === 0) {
      return {
        selectedNode: availableNodes[0], // Fallback zur ersten verfügbaren Node
        reason: 'fallback',
        expectedLatency: availableNodes[0].latency,
        confidence: 0.1,
        alternatives: availableNodes.slice(1)
      };
    }

    // Load Balancing-Strategie anwenden
    const selectedNode = this.applyLoadBalancingStrategy(suitableNodes, request);
    const alternatives = suitableNodes.filter(node => node.nodeId !== selectedNode.nodeId);

    return {
      selectedNode,
      reason: this.determineRoutingReason(selectedNode, suitableNodes),
      expectedLatency: selectedNode.latency,
      confidence: this.calculateRoutingConfidence(selectedNode, suitableNodes),
      alternatives
    };
  }

  private applyLoadBalancingStrategy(nodes: EdgeNodeInfo[], request: EdgeInferenceRequest): EdgeNodeInfo {
    const strategy = this.loadBalancingStrategy;

    switch (strategy.name) {
      case 'round-robin':
        return this.roundRobinSelection(nodes);
      
      case 'least-connections':
        return this.leastConnectionsSelection(nodes);
      
      case 'latency-based':
        return nodes.reduce((best, current) => 
          current.latency < best.latency ? current : best
        );
      
      case 'capacity-based':
        return nodes.reduce((best, current) => 
          current.availableCapacity > best.availableCapacity ? current : best
        );
      
      case 'adaptive':
      default:
        return this.adaptiveSelection(nodes, request);
    }
  }

  private roundRobinSelection(nodes: EdgeNodeInfo[]): EdgeNodeInfo {
    // Einfache Round-Robin-Implementation
    const timestamp = Date.now();
    const index = Math.floor(timestamp / 1000) % nodes.length;
    return nodes[index];
  }

  private leastConnectionsSelection(nodes: EdgeNodeInfo[]): EdgeNodeInfo {
    // Wähle Node mit geringster CPU-Auslastung als Proxy für Connections
    return nodes.reduce((best, current) => 
      current.cpuUsage < best.cpuUsage ? current : best
    );
  }

  private adaptiveSelection(nodes: EdgeNodeInfo[], request: EdgeInferenceRequest): EdgeNodeInfo {
    const weights = this.loadBalancingStrategy.weights;
    
    // Scores für alle Nodes berechnen
    const nodeScores = nodes.map(node => {
      const nodeClient = this.nodes.get(node.nodeId);
      const score = nodeClient ? nodeClient.getScore(weights) : 0;
      
      return { node, score };
    });

    // Exploration vs. Exploitation
    const explorationRate = this.loadBalancingStrategy.adaptiveParams.explorationRate;
    
    if (Math.random() < explorationRate) {
      // Exploration: Zufällige Auswahl
      const randomIndex = Math.floor(Math.random() * nodeScores.length);
      return nodeScores[randomIndex].node;
    } else {
      // Exploitation: Beste Node auswählen
      const bestNode = nodeScores.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      return bestNode.node;
    }
  }

  private determineRoutingReason(selectedNode: EdgeNodeInfo, availableNodes: EdgeNodeInfo[]): RoutingDecision['reason'] {
    const avgLatency = availableNodes.reduce((sum, node) => sum + node.latency, 0) / availableNodes.length;
    const avgCapacity = availableNodes.reduce((sum, node) => sum + node.availableCapacity, 0) / availableNodes.length;

    if (selectedNode.latency < avgLatency * 0.8) {
      return 'latency';
    } else if (selectedNode.availableCapacity > avgCapacity * 1.2) {
      return 'capacity';
    } else if (selectedNode.availableModels.length > 0) {
      return 'model-availability';
    } else {
      return 'fallback';
    }
  }

  private calculateRoutingConfidence(selectedNode: EdgeNodeInfo, availableNodes: EdgeNodeInfo[]): number {
    if (availableNodes.length === 1) {
      return 1.0; // Keine Alternative
    }

    // Confidence basierend auf relativer Performance
    const nodeClient = this.nodes.get(selectedNode.nodeId);
    const selectedScore = nodeClient ? nodeClient.getScore(this.loadBalancingStrategy.weights) : 0;
    
    const otherScores = availableNodes
      .filter(node => node.nodeId !== selectedNode.nodeId)
      .map(node => {
        const client = this.nodes.get(node.nodeId);
        return client ? client.getScore(this.loadBalancingStrategy.weights) : 0;
      });

    if (otherScores.length === 0) {
      return 1.0;
    }

    const maxOtherScore = Math.max(...otherScores);
    return maxOtherScore > 0 ? Math.min(1.0, selectedScore / maxOtherScore) : 1.0;
  }

  // =============================================================================
  // Adaptive Learning
  // =============================================================================

  private updateAdaptiveLearning(
    decision: RoutingDecision,
    response: EdgeInferenceResponse | null,
    error?: Error
  ): void {
    const learningRate = this.loadBalancingStrategy.adaptiveParams.learningRate;
    const nodeClient = this.nodes.get(decision.selectedNode.nodeId);

    if (!nodeClient) return;

    // Feedback-Score berechnen
    let feedbackScore = 0;

    if (response) {
      // Erfolgreiche Verarbeitung
      const latencyScore = Math.max(0, 1 - (response.processingTime / 1000)); // <1s = gut
      const confidenceScore = response.confidence;
      feedbackScore = (latencyScore + confidenceScore) / 2;
    } else if (error) {
      // Fehlerhafte Verarbeitung
      feedbackScore = 0;
    }

    // Gewichtungen adaptiv anpassen
    const weights = this.loadBalancingStrategy.weights;

    if (response && response.processingTime < 50) {
      // Sehr gute Latenz -> Latenz-Gewichtung erhöhen
      weights.latency = Math.min(1.0, weights.latency + learningRate * 0.1);
    } else if (error || (response && response.processingTime > 200)) {
      // Schlechte Performance -> Reliability-Gewichtung erhöhen
      weights.reliability = Math.min(1.0, weights.reliability + learningRate * 0.1);
    }

    // Gewichtungen normalisieren
    const totalWeight = weights.latency + weights.capacity + weights.reliability + weights.cost;
    weights.latency /= totalWeight;
    weights.capacity /= totalWeight;
    weights.reliability /= totalWeight;
    weights.cost /= totalWeight;
  }

  // =============================================================================
  // Performance Monitoring
  // =============================================================================

  private initializeMetrics(): void {
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
        byProcessingMode: new Map(),
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

  private initializeHealthStatus(): void {
    this.healthStatus = {
      overall: 'healthy',
      nodeHealth: new Map(),
      activeAlerts: [],
      lastHealthChecks: new Map(),
      systemCapacity: {
        total: 0,
        available: 0,
        reserved: 0
      }
    };
  }

  updatePerformanceMetrics(): void {
    const availableNodes = this.getAvailableNodes();

    if (availableNodes.length === 0) {
      return;
    }

    // Latenz-Metriken berechnen
    const latencies = availableNodes.map(node => node.latency);
    latencies.sort((a, b) => a - b);

    this.performanceMetrics.latency.edgeNode = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    this.performanceMetrics.latency.p50 = latencies[Math.floor(latencies.length * 0.5)];
    this.performanceMetrics.latency.p95 = latencies[Math.floor(latencies.length * 0.95)];
    this.performanceMetrics.latency.p99 = latencies[Math.floor(latencies.length * 0.99)];

    // Ressourcen-Nutzung berechnen
    const avgCpuUsage = availableNodes.reduce((sum, node) => sum + node.cpuUsage, 0) / availableNodes.length;
    const avgMemoryUsage = availableNodes.reduce((sum, node) => sum + node.memoryUsage, 0) / availableNodes.length;

    this.performanceMetrics.resourceUsage.cpu = avgCpuUsage;
    this.performanceMetrics.resourceUsage.memory = avgMemoryUsage;

    // System-Kapazität berechnen
    const totalCapacity = availableNodes.length;
    const availableCapacity = availableNodes.filter(node => node.availableCapacity > 0.1).length;

    this.healthStatus.systemCapacity = {
      total: totalCapacity,
      available: availableCapacity,
      reserved: totalCapacity - availableCapacity
    };

    // Gesundheitsstatus aktualisieren
    this.updateHealthStatus();
  }

  private updateHealthStatus(): void {
    const nodes = Array.from(this.nodes.values());
    const healthyNodes = nodes.filter(client => client.isAvailable()).length;
    const totalNodes = nodes.length;

    // Overall Health bestimmen
    if (healthyNodes === 0) {
      this.healthStatus.overall = 'unhealthy';
    } else if (healthyNodes < totalNodes * 0.7) {
      this.healthStatus.overall = 'degraded';
    } else {
      this.healthStatus.overall = 'healthy';
    }

    // Node-spezifische Gesundheit aktualisieren
    this.healthStatus.nodeHealth.clear();
    nodes.forEach(client => {
      const nodeInfo = client.getNodeInfo();
      const health = client.isAvailable() ? 'healthy' : 'unhealthy';
      this.healthStatus.nodeHealth.set(nodeInfo.nodeId, health);
      this.healthStatus.lastHealthChecks.set(nodeInfo.nodeId, nodeInfo.lastHealthCheck);
    });

    // Alerts generieren
    this.generateHealthAlerts();
  }

  private generateHealthAlerts(): void {
    const currentTime = new Date();
    this.healthStatus.activeAlerts = [];

    // Latenz-Alerts
    if (this.performanceMetrics.latency.p95 > 100) {
      this.healthStatus.activeAlerts.push({
        alertId: `latency-${Date.now()}`,
        level: 'warning',
        message: `Hohe P95-Latenz: ${this.performanceMetrics.latency.p95.toFixed(2)}ms`,
        timestamp: currentTime,
        type: 'latency',
        metadata: { p95Latency: this.performanceMetrics.latency.p95 }
      });
    }

    // Kapazitäts-Alerts
    const capacityUtilization = 1 - (this.healthStatus.systemCapacity.available / this.healthStatus.systemCapacity.total);
    if (capacityUtilization > 0.8) {
      this.healthStatus.activeAlerts.push({
        alertId: `capacity-${Date.now()}`,
        level: 'warning',
        message: `Hohe Kapazitäts-Auslastung: ${(capacityUtilization * 100).toFixed(1)}%`,
        timestamp: currentTime,
        type: 'capacity',
        metadata: { capacityUtilization }
      });
    }

    // Node-Health-Alerts
    this.healthStatus.nodeHealth.forEach((health, nodeId) => {
      if (health === 'unhealthy') {
        this.healthStatus.activeAlerts.push({
          alertId: `node-${nodeId}-${Date.now()}`,
          level: 'error',
          message: `Edge-Node ${nodeId} ist nicht verfügbar`,
          nodeId,
          timestamp: currentTime,
          type: 'connectivity',
          metadata: { nodeId }
        });
      }
    });
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

  off<K extends keyof EdgeEventMap>(event: K, listener: (data: EdgeEventMap[K]) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  private emit<K extends keyof EdgeEventMap>(event: K, data: EdgeEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[EdgeNodeManager] Fehler in Event Listener für ${event}:`, error);
        }
      });
    }
  }

  // =============================================================================
  // Public API
  // =============================================================================

  getPerformanceMetrics(): EdgePerformanceMetrics {
    this.updatePerformanceMetrics();
    return { ...this.performanceMetrics };
  }

  getHealthStatus(): EdgeHealthStatus {
    this.updatePerformanceMetrics(); // Aktualisiert auch Health Status
    return { ...this.healthStatus };
  }

  getRoutingHistory(): RoutingDecision[] {
    return [...this.routingHistory];
  }

  setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void {
    this.loadBalancingStrategy = { ...strategy };
    console.log(`[EdgeNodeManager] Load Balancing-Strategie geändert zu: ${strategy.name}`);
  }

  enableAdaptiveLearning(enabled: boolean): void {
    this.adaptiveLearning = enabled;
    console.log(`[EdgeNodeManager] Adaptive Learning ${enabled ? 'aktiviert' : 'deaktiviert'}`);
  }

  async cleanup(): Promise<void> {
    // Alle Node-Clients cleanup
    for (const nodeClient of this.nodes.values()) {
      nodeClient.cleanup();
    }

    this.nodes.clear();
    this.listeners.clear();
    this.routingHistory = [];

    console.log('[EdgeNodeManager] Cleanup abgeschlossen');
  }
}
