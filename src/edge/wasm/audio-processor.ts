/**
 * WebAssembly Audio Processor für Edge Computing
 * 
 * Hochperformante lokale Audio-Verarbeitung mit WebAssembly.
 * Ziel: <20ms Latenz für lokale Audio-Processing-Operationen.
 * 
 * @version 1.0.0
 */

import type {
  WASMModuleConfig,
  AudioProcessingWASMInterface,
  AudioEnhancementParams,
  AudioSpectralAnalysis,
  EdgePerformanceMetrics,
  WASMProcessingError
} from '../types';

// =============================================================================
// WASM Module Loader
// =============================================================================

class WASMModuleLoader {
  private static instance: WASMModuleLoader;
  private loadedModules: Map<string, WebAssembly.Module> = new Map();
  private moduleInstances: Map<string, WebAssembly.Instance> = new Map();

  static getInstance(): WASMModuleLoader {
    if (!WASMModuleLoader.instance) {
      WASMModuleLoader.instance = new WASMModuleLoader();
    }
    return WASMModuleLoader.instance;
  }

  async loadModule(config: WASMModuleConfig): Promise<WebAssembly.Instance> {
    const { moduleName, wasmUrl, memoryConfig, threadingEnabled, simdEnabled } = config;

    // Prüfe ob Modul bereits geladen
    if (this.moduleInstances.has(moduleName)) {
      return this.moduleInstances.get(moduleName)!;
    }

    try {
      // WebAssembly-Features prüfen
      this.validateWASMSupport(threadingEnabled, simdEnabled);

      // WASM-Datei laden
      const wasmBytes = await this.fetchWASMBytes(wasmUrl);
      
      // Modul kompilieren
      const module = await WebAssembly.compile(wasmBytes);
      this.loadedModules.set(moduleName, module);

      // Memory erstellen
      const memory = new WebAssembly.Memory({
        initial: memoryConfig.initial,
        maximum: memoryConfig.maximum,
        shared: memoryConfig.shared && threadingEnabled
      });

      // Import-Objekt erstellen
      const imports = this.createImports(memory, config);

      // Instanz erstellen
      const instance = await WebAssembly.instantiate(module, imports);
      this.moduleInstances.set(moduleName, instance);

      console.log(`[WASM] Modul ${moduleName} erfolgreich geladen`);
      return instance;

    } catch (error) {
      console.error(`[WASM] Fehler beim Laden von ${moduleName}:`, error);
      throw new WASMProcessingError(
        `Fehler beim Laden des WASM-Moduls: ${error}`,
        moduleName,
        { wasmUrl, error }
      );
    }
  }

  private validateWASMSupport(threadingEnabled: boolean, simdEnabled: boolean): void {
    // Basis WebAssembly-Unterstützung
    if (!WebAssembly) {
      throw new Error('WebAssembly wird nicht unterstützt');
    }

    // Threading-Unterstützung prüfen
    if (threadingEnabled && !this.isThreadingSupported()) {
      console.warn('[WASM] Threading nicht unterstützt, deaktiviere Threading');
    }

    // SIMD-Unterstützung prüfen
    if (simdEnabled && !this.isSIMDSupported()) {
      console.warn('[WASM] SIMD nicht unterstützt, deaktiviere SIMD');
    }
  }

  private isThreadingSupported(): boolean {
    return typeof SharedArrayBuffer !== 'undefined' && 
           typeof Atomics !== 'undefined';
  }

  private isSIMDSupported(): boolean {
    // SIMD-Unterstützung ist schwer zu detektieren, verwende Feature-Detection
    try {
      return WebAssembly.validate(new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // WASM header
        0x01, 0x05, 0x01, 0x60, 0x01, 0x7b, 0x00,       // SIMD type
      ]));
    } catch {
      return false;
    }
  }

  private async fetchWASMBytes(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }

  private createImports(memory: WebAssembly.Memory, config: WASMModuleConfig): WebAssembly.Imports {
    return {
      env: {
        memory,
        // Math-Funktionen
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        log: Math.log,
        exp: Math.exp,
        sqrt: Math.sqrt,
        pow: Math.pow,
        // Console-Funktionen für Debugging
        console_log: (ptr: number, len: number) => {
          const bytes = new Uint8Array(memory.buffer, ptr, len);
          const str = new TextDecoder().decode(bytes);
          console.log(`[WASM ${config.moduleName}]`, str);
        },
        console_error: (ptr: number, len: number) => {
          const bytes = new Uint8Array(memory.buffer, ptr, len);
          const str = new TextDecoder().decode(bytes);
          console.error(`[WASM ${config.moduleName}]`, str);
        },
        // Performance-Funktionen
        performance_now: () => performance.now(),
        // Abort-Handler
        abort: (msg: number, file: number, line: number, column: number) => {
          throw new Error(`WASM Abort: ${msg} at ${file}:${line}:${column}`);
        }
      }
    };
  }
}

// =============================================================================
// Audio Processor WASM Interface
// =============================================================================

export class EdgeAudioProcessor implements AudioProcessingWASMInterface {
  private wasmInstance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory | null = null;
  private moduleLoader: WASMModuleLoader;
  private isInitialized: boolean = false;
  private performanceMetrics: EdgePerformanceMetrics;

  // WASM-Funktions-Pointer
  private wasmFunctions: {
    processAudio?: Function;
    detectVAD?: Function;
    reduceNoise?: Function;
    cancelEcho?: Function;
    enhanceAudio?: Function;
    analyzeSpectrum?: Function;
    malloc?: Function;
    free?: Function;
  } = {};

  constructor() {
    this.moduleLoader = WASMModuleLoader.getInstance();
    this.initializeMetrics();
  }

  // =============================================================================
  // Initialisierung
  // =============================================================================

  async initialize(config?: Partial<WASMModuleConfig>): Promise<void> {
    if (this.isInitialized) {
      console.warn('[EdgeAudioProcessor] Bereits initialisiert');
      return;
    }

    const defaultConfig: WASMModuleConfig = {
      moduleName: 'edge-audio-processor',
      wasmUrl: '/wasm/edge-audio-processor.wasm',
      initParams: {},
      memoryConfig: {
        initial: 256,  // 16MB initial
        maximum: 1024, // 64MB maximum
        shared: false
      },
      threadingEnabled: false,
      simdEnabled: true
    };

    const finalConfig = { ...defaultConfig, ...config };

    try {
      console.log('[EdgeAudioProcessor] Initialisiere WASM-Modul...');
      
      this.wasmInstance = await this.moduleLoader.loadModule(finalConfig);
      this.memory = this.wasmInstance.exports.memory as WebAssembly.Memory;
      
      // WASM-Funktionen extrahieren
      this.extractWASMFunctions();
      
      // Modul initialisieren
      await this.initializeWASMModule(finalConfig.initParams);
      
      this.isInitialized = true;
      console.log('[EdgeAudioProcessor] WASM-Modul erfolgreich initialisiert');
      
    } catch (error) {
      console.error('[EdgeAudioProcessor] Initialisierung fehlgeschlagen:', error);
      throw new WASMProcessingError(
        'Fehler bei der WASM-Initialisierung',
        'edge-audio-processor',
        { error }
      );
    }
  }

  private extractWASMFunctions(): void {
    if (!this.wasmInstance) return;

    const exports = this.wasmInstance.exports;
    
    this.wasmFunctions = {
      processAudio: exports.process_audio as Function,
      detectVAD: exports.detect_vad as Function,
      reduceNoise: exports.reduce_noise as Function,
      cancelEcho: exports.cancel_echo as Function,
      enhanceAudio: exports.enhance_audio as Function,
      analyzeSpectrum: exports.analyze_spectrum as Function,
      malloc: exports.malloc as Function,
      free: exports.free as Function
    };

    // Validiere kritische Funktionen
    const requiredFunctions = ['processAudio', 'malloc', 'free'];
    for (const funcName of requiredFunctions) {
      if (!this.wasmFunctions[funcName as keyof typeof this.wasmFunctions]) {
        throw new WASMProcessingError(
          `Kritische WASM-Funktion nicht gefunden: ${funcName}`,
          'edge-audio-processor'
        );
      }
    }
  }

  private async initializeWASMModule(initParams: Record<string, any>): Promise<void> {
    if (!this.wasmInstance || !this.wasmFunctions.processAudio) return;

    // Initialisierungs-Parameter an WASM übergeben
    const initFunc = this.wasmInstance.exports.initialize as Function;
    if (initFunc) {
      const result = initFunc();
      if (result !== 0) {
        throw new WASMProcessingError(
          'WASM-Modul-Initialisierung fehlgeschlagen',
          'edge-audio-processor',
          { initResult: result }
        );
      }
    }
  }

  // =============================================================================
  // Audio Processing Interface
  // =============================================================================

  async processAudio(audioData: Float32Array, sampleRate: number): Promise<Float32Array> {
    if (!this.isInitialized) {
      throw new WASMProcessingError('WASM-Modul nicht initialisiert', 'edge-audio-processor');
    }

    const startTime = performance.now();

    try {
      // Audio-Daten in WASM-Memory kopieren
      const inputPtr = this.allocateAudioBuffer(audioData);
      const outputPtr = this.wasmFunctions.malloc!(audioData.length * 4); // Float32 = 4 bytes

      // WASM-Funktion aufrufen
      const result = this.wasmFunctions.processAudio!(
        inputPtr,
        outputPtr,
        audioData.length,
        sampleRate
      );

      if (result !== 0) {
        throw new Error(`WASM processAudio returned error code: ${result}`);
      }

      // Ergebnis aus WASM-Memory lesen
      const outputData = this.readAudioBuffer(outputPtr, audioData.length);

      // Memory freigeben
      this.wasmFunctions.free!(inputPtr);
      this.wasmFunctions.free!(outputPtr);

      // Performance-Metriken aktualisieren
      const processingTime = performance.now() - startTime;
      this.updatePerformanceMetrics('processAudio', processingTime, audioData.length);

      return outputData;

    } catch (error) {
      console.error('[EdgeAudioProcessor] processAudio Fehler:', error);
      throw new WASMProcessingError(
        `Audio-Verarbeitung fehlgeschlagen: ${error}`,
        'edge-audio-processor',
        { sampleRate, audioLength: audioData.length }
      );
    }
  }

  async detectVoiceActivity(audioData: Float32Array): Promise<boolean> {
    if (!this.isInitialized || !this.wasmFunctions.detectVAD) {
      // Fallback zu JavaScript-Implementation
      return this.detectVoiceActivityJS(audioData);
    }

    const startTime = performance.now();

    try {
      const inputPtr = this.allocateAudioBuffer(audioData);
      const result = this.wasmFunctions.detectVAD!(inputPtr, audioData.length);
      this.wasmFunctions.free!(inputPtr);

      const processingTime = performance.now() - startTime;
      this.updatePerformanceMetrics('detectVAD', processingTime, audioData.length);

      return result === 1;

    } catch (error) {
      console.error('[EdgeAudioProcessor] detectVAD Fehler:', error);
      return this.detectVoiceActivityJS(audioData);
    }
  }

  async reduceNoise(audioData: Float32Array, noiseProfile?: Float32Array): Promise<Float32Array> {
    if (!this.isInitialized || !this.wasmFunctions.reduceNoise) {
      // Fallback zu JavaScript-Implementation
      return this.reduceNoiseJS(audioData);
    }

    const startTime = performance.now();

    try {
      const inputPtr = this.allocateAudioBuffer(audioData);
      const outputPtr = this.wasmFunctions.malloc!(audioData.length * 4);
      const noisePtr = noiseProfile ? this.allocateAudioBuffer(noiseProfile) : 0;

      const result = this.wasmFunctions.reduceNoise!(
        inputPtr,
        outputPtr,
        audioData.length,
        noisePtr,
        noiseProfile ? noiseProfile.length : 0
      );

      if (result !== 0) {
        throw new Error(`WASM reduceNoise returned error code: ${result}`);
      }

      const outputData = this.readAudioBuffer(outputPtr, audioData.length);

      this.wasmFunctions.free!(inputPtr);
      this.wasmFunctions.free!(outputPtr);
      if (noisePtr) this.wasmFunctions.free!(noisePtr);

      const processingTime = performance.now() - startTime;
      this.updatePerformanceMetrics('reduceNoise', processingTime, audioData.length);

      return outputData;

    } catch (error) {
      console.error('[EdgeAudioProcessor] reduceNoise Fehler:', error);
      return this.reduceNoiseJS(audioData);
    }
  }

  async cancelEcho(audioData: Float32Array, referenceAudio?: Float32Array): Promise<Float32Array> {
    if (!this.isInitialized || !this.wasmFunctions.cancelEcho) {
      return new Float32Array(audioData); // Passthrough
    }

    const startTime = performance.now();

    try {
      const inputPtr = this.allocateAudioBuffer(audioData);
      const outputPtr = this.wasmFunctions.malloc!(audioData.length * 4);
      const refPtr = referenceAudio ? this.allocateAudioBuffer(referenceAudio) : 0;

      const result = this.wasmFunctions.cancelEcho!(
        inputPtr,
        outputPtr,
        audioData.length,
        refPtr,
        referenceAudio ? referenceAudio.length : 0
      );

      if (result !== 0) {
        throw new Error(`WASM cancelEcho returned error code: ${result}`);
      }

      const outputData = this.readAudioBuffer(outputPtr, audioData.length);

      this.wasmFunctions.free!(inputPtr);
      this.wasmFunctions.free!(outputPtr);
      if (refPtr) this.wasmFunctions.free!(refPtr);

      const processingTime = performance.now() - startTime;
      this.updatePerformanceMetrics('cancelEcho', processingTime, audioData.length);

      return outputData;

    } catch (error) {
      console.error('[EdgeAudioProcessor] cancelEcho Fehler:', error);
      return new Float32Array(audioData);
    }
  }

  async enhanceAudio(audioData: Float32Array, enhancementParams?: AudioEnhancementParams): Promise<Float32Array> {
    if (!this.isInitialized || !this.wasmFunctions.enhanceAudio) {
      return this.enhanceAudioJS(audioData, enhancementParams);
    }

    const startTime = performance.now();

    try {
      const inputPtr = this.allocateAudioBuffer(audioData);
      const outputPtr = this.wasmFunctions.malloc!(audioData.length * 4);
      
      // Enhancement-Parameter serialisieren
      const paramsPtr = this.serializeEnhancementParams(enhancementParams);

      const result = this.wasmFunctions.enhanceAudio!(
        inputPtr,
        outputPtr,
        audioData.length,
        paramsPtr
      );

      if (result !== 0) {
        throw new Error(`WASM enhanceAudio returned error code: ${result}`);
      }

      const outputData = this.readAudioBuffer(outputPtr, audioData.length);

      this.wasmFunctions.free!(inputPtr);
      this.wasmFunctions.free!(outputPtr);
      if (paramsPtr) this.wasmFunctions.free!(paramsPtr);

      const processingTime = performance.now() - startTime;
      this.updatePerformanceMetrics('enhanceAudio', processingTime, audioData.length);

      return outputData;

    } catch (error) {
      console.error('[EdgeAudioProcessor] enhanceAudio Fehler:', error);
      return this.enhanceAudioJS(audioData, enhancementParams);
    }
  }

  async analyzeSpectrum(audioData: Float32Array): Promise<AudioSpectralAnalysis> {
    if (!this.isInitialized || !this.wasmFunctions.analyzeSpectrum) {
      return this.analyzeSpectrumJS(audioData);
    }

    const startTime = performance.now();

    try {
      const inputPtr = this.allocateAudioBuffer(audioData);
      const resultPtr = this.wasmFunctions.malloc!(1024); // Platz für Analyse-Ergebnisse

      const result = this.wasmFunctions.analyzeSpectrum!(
        inputPtr,
        audioData.length,
        resultPtr
      );

      if (result !== 0) {
        throw new Error(`WASM analyzeSpectrum returned error code: ${result}`);
      }

      const analysis = this.deserializeSpectralAnalysis(resultPtr);

      this.wasmFunctions.free!(inputPtr);
      this.wasmFunctions.free!(resultPtr);

      const processingTime = performance.now() - startTime;
      this.updatePerformanceMetrics('analyzeSpectrum', processingTime, audioData.length);

      return analysis;

    } catch (error) {
      console.error('[EdgeAudioProcessor] analyzeSpectrum Fehler:', error);
      return this.analyzeSpectrumJS(audioData);
    }
  }

  // =============================================================================
  // Memory Management
  // =============================================================================

  private allocateAudioBuffer(audioData: Float32Array): number {
    if (!this.wasmFunctions.malloc || !this.memory) {
      throw new WASMProcessingError('WASM Memory-Funktionen nicht verfügbar', 'edge-audio-processor');
    }

    const byteLength = audioData.length * 4; // Float32 = 4 bytes
    const ptr = this.wasmFunctions.malloc(byteLength);

    if (ptr === 0) {
      throw new WASMProcessingError('WASM Memory-Allokation fehlgeschlagen', 'edge-audio-processor');
    }

    // Audio-Daten in WASM-Memory kopieren
    const wasmArray = new Float32Array(this.memory.buffer, ptr, audioData.length);
    wasmArray.set(audioData);

    return ptr;
  }

  private readAudioBuffer(ptr: number, length: number): Float32Array {
    if (!this.memory) {
      throw new WASMProcessingError('WASM Memory nicht verfügbar', 'edge-audio-processor');
    }

    const wasmArray = new Float32Array(this.memory.buffer, ptr, length);
    return new Float32Array(wasmArray); // Kopie erstellen
  }

  private serializeEnhancementParams(params?: AudioEnhancementParams): number {
    if (!params || !this.wasmFunctions.malloc || !this.memory) {
      return 0;
    }

    // Vereinfachte Serialisierung für Demo
    const paramArray = new Float32Array([
      params.gainControl || 1.0,
      params.noiseGate || 0.01,
      params.compressionRatio || 1.0
    ]);

    const ptr = this.wasmFunctions.malloc(paramArray.length * 4);
    const wasmArray = new Float32Array(this.memory.buffer, ptr, paramArray.length);
    wasmArray.set(paramArray);

    return ptr;
  }

  private deserializeSpectralAnalysis(ptr: number): AudioSpectralAnalysis {
    if (!this.memory) {
      throw new WASMProcessingError('WASM Memory nicht verfügbar', 'edge-audio-processor');
    }

    // Vereinfachte Deserialisierung für Demo
    const dataView = new DataView(this.memory.buffer, ptr);

    return {
      frequencySpectrum: new Float32Array(512), // Placeholder
      melSpectrogram: new Float32Array(128),
      mfccFeatures: new Float32Array(13),
      fundamentalFreq: dataView.getFloat32(0, true),
      spectralCentroid: dataView.getFloat32(4, true),
      spectralRolloff: dataView.getFloat32(8, true),
      zeroCrossingRate: dataView.getFloat32(12, true)
    };
  }

  // =============================================================================
  // JavaScript Fallback-Implementierungen
  // =============================================================================

  private detectVoiceActivityJS(audioData: Float32Array): boolean {
    // Einfache Energy-basierte VAD
    let energy = 0;
    for (let i = 0; i < audioData.length; i++) {
      energy += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(energy / audioData.length);
    return rms > 0.01; // Threshold
  }

  private reduceNoiseJS(audioData: Float32Array): Float32Array {
    // Einfache Spectral Subtraction (vereinfacht)
    const output = new Float32Array(audioData.length);
    const noiseFloor = 0.001;

    for (let i = 0; i < audioData.length; i++) {
      const sample = audioData[i];
      if (Math.abs(sample) > noiseFloor) {
        output[i] = sample;
      } else {
        output[i] = sample * 0.1; // Noise reduction
      }
    }

    return output;
  }

  private enhanceAudioJS(audioData: Float32Array, params?: AudioEnhancementParams): Float32Array {
    const output = new Float32Array(audioData.length);
    const gain = params?.gainControl || 1.0;
    const noiseGate = params?.noiseGate || 0.01;

    for (let i = 0; i < audioData.length; i++) {
      let sample = audioData[i];

      // Noise Gate
      if (Math.abs(sample) < noiseGate) {
        sample = 0;
      }

      // Gain Control
      sample *= gain;

      // Clipping Prevention
      sample = Math.max(-1, Math.min(1, sample));

      output[i] = sample;
    }

    return output;
  }

  private analyzeSpectrumJS(audioData: Float32Array): AudioSpectralAnalysis {
    // Vereinfachte Spektral-Analyse
    const fftSize = Math.min(2048, audioData.length);
    const spectrum = this.computeFFT(audioData.slice(0, fftSize));

    return {
      frequencySpectrum: spectrum,
      melSpectrogram: new Float32Array(128), // Placeholder
      mfccFeatures: new Float32Array(13),    // Placeholder
      fundamentalFreq: this.estimateFundamentalFreq(spectrum),
      spectralCentroid: this.computeSpectralCentroid(spectrum),
      spectralRolloff: this.computeSpectralRolloff(spectrum),
      zeroCrossingRate: this.computeZeroCrossingRate(audioData)
    };
  }

  private computeFFT(audioData: Float32Array): Float32Array {
    // Vereinfachte FFT-Implementation (für Demo)
    const N = audioData.length;
    const spectrum = new Float32Array(N / 2);

    for (let k = 0; k < N / 2; k++) {
      let real = 0, imag = 0;
      for (let n = 0; n < N; n++) {
        const angle = -2 * Math.PI * k * n / N;
        real += audioData[n] * Math.cos(angle);
        imag += audioData[n] * Math.sin(angle);
      }
      spectrum[k] = Math.sqrt(real * real + imag * imag);
    }

    return spectrum;
  }

  private estimateFundamentalFreq(spectrum: Float32Array): number {
    let maxIndex = 0;
    let maxValue = 0;

    for (let i = 1; i < spectrum.length; i++) {
      if (spectrum[i] > maxValue) {
        maxValue = spectrum[i];
        maxIndex = i;
      }
    }

    return maxIndex * 48000 / (2 * spectrum.length); // Assuming 48kHz sample rate
  }

  private computeSpectralCentroid(spectrum: Float32Array): number {
    let weightedSum = 0;
    let magnitudeSum = 0;

    for (let i = 0; i < spectrum.length; i++) {
      weightedSum += i * spectrum[i];
      magnitudeSum += spectrum[i];
    }

    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  private computeSpectralRolloff(spectrum: Float32Array): number {
    const totalEnergy = spectrum.reduce((sum, val) => sum + val, 0);
    const threshold = totalEnergy * 0.85; // 85% rolloff

    let cumulativeEnergy = 0;
    for (let i = 0; i < spectrum.length; i++) {
      cumulativeEnergy += spectrum[i];
      if (cumulativeEnergy >= threshold) {
        return i;
      }
    }

    return spectrum.length - 1;
  }

  private computeZeroCrossingRate(audioData: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < audioData.length; i++) {
      if ((audioData[i] >= 0) !== (audioData[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / audioData.length;
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

  private updatePerformanceMetrics(operation: string, processingTime: number, dataSize: number): void {
    // Lokale Latenz aktualisieren
    this.performanceMetrics.latency.local = processingTime;

    // Durchsatz berechnen
    const bytesPerSecond = (dataSize * 4) / (processingTime / 1000); // Float32 = 4 bytes
    this.performanceMetrics.throughput.bytesPerSecond = bytesPerSecond;

    console.debug(`[EdgeAudioProcessor] ${operation}: ${processingTime.toFixed(2)}ms, ${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`);
  }

  // =============================================================================
  // Public API
  // =============================================================================

  getPerformanceMetrics(): EdgePerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async cleanup(): Promise<void> {
    if (this.wasmInstance) {
      // Cleanup-Funktion aufrufen falls verfügbar
      const cleanupFunc = this.wasmInstance.exports.cleanup as Function;
      if (cleanupFunc) {
        cleanupFunc();
      }
    }

    this.isInitialized = false;
    this.wasmInstance = null;
    this.memory = null;
    this.wasmFunctions = {};

    console.log('[EdgeAudioProcessor] Cleanup abgeschlossen');
  }
}
