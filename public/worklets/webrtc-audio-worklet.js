/**
 * WebRTC Audio Worklet für optimierte Audio-Verarbeitung
 * 
 * Verarbeitet Audio-Daten in Echtzeit für WebRTC-Übertragung.
 * Optimiert für niedrige Latenz und hohe Qualität.
 * 
 * @version 1.0.0
 */

class WebRTCAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // Konfiguration aus Optionen
    this.sampleRate = options.processorOptions?.sampleRate || 48000;
    this.channelCount = options.processorOptions?.channelCount || 1;
    this.bufferSize = options.processorOptions?.bufferSize || 1024;
    
    // Audio-Verarbeitung State
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.isProcessing = true;
    
    // Performance Monitoring
    this.processedSamples = 0;
    this.lastStatsTime = 0;
    this.processingTime = 0;
    
    // Audio-Qualität Parameter
    this.gainControl = 1.0;
    this.noiseGate = 0.01; // Noise Gate Threshold
    this.compressionRatio = 2.0;
    this.compressionThreshold = 0.7;
    
    // VAD (Voice Activity Detection) Parameter
    this.vadEnabled = true;
    this.vadThreshold = 0.02;
    this.vadSmoothingFactor = 0.95;
    this.vadLevel = 0;
    this.speechDetected = false;
    
    // Message Handler für Konfiguration
    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
    
    console.log('[WebRTC Audio Worklet] Initialisiert', {
      sampleRate: this.sampleRate,
      channelCount: this.channelCount,
      bufferSize: this.bufferSize
    });
  }

  /**
   * Audio-Verarbeitung (wird für jeden Audio-Block aufgerufen)
   */
  process(inputs, outputs, parameters) {
    const startTime = performance.now();
    
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || input.length === 0) {
      return this.isProcessing;
    }
    
    const inputChannel = input[0];
    const outputChannel = output[0];
    
    if (!inputChannel || inputChannel.length === 0) {
      return this.isProcessing;
    }
    
    // Audio-Daten verarbeiten
    for (let i = 0; i < inputChannel.length; i++) {
      let sample = inputChannel[i];
      
      // Audio-Processing Pipeline
      sample = this.applyNoiseGate(sample);
      sample = this.applyGainControl(sample);
      sample = this.applyCompression(sample);
      
      // VAD (Voice Activity Detection)
      this.updateVAD(sample);
      
      // Sample zum Buffer hinzufügen
      this.inputBuffer[this.bufferIndex] = sample;
      this.bufferIndex++;
      
      // Output für Monitoring
      if (outputChannel) {
        outputChannel[i] = sample;
      }
      
      // Buffer voll - Audio-Daten senden
      if (this.bufferIndex >= this.bufferSize) {
        this.sendAudioData();
        this.bufferIndex = 0;
      }
    }
    
    // Performance Monitoring
    this.processingTime += performance.now() - startTime;
    this.processedSamples += inputChannel.length;
    this.updateStats();
    
    return this.isProcessing;
  }

  /**
   * Noise Gate anwenden
   */
  applyNoiseGate(sample) {
    const amplitude = Math.abs(sample);
    if (amplitude < this.noiseGate) {
      return 0; // Signal unterdrücken
    }
    return sample;
  }

  /**
   * Gain Control anwenden
   */
  applyGainControl(sample) {
    return sample * this.gainControl;
  }

  /**
   * Dynamische Kompression anwenden
   */
  applyCompression(sample) {
    const amplitude = Math.abs(sample);
    
    if (amplitude > this.compressionThreshold) {
      const excess = amplitude - this.compressionThreshold;
      const compressedExcess = excess / this.compressionRatio;
      const newAmplitude = this.compressionThreshold + compressedExcess;
      
      return sample * (newAmplitude / amplitude);
    }
    
    return sample;
  }

  /**
   * Voice Activity Detection aktualisieren
   */
  updateVAD(sample) {
    if (!this.vadEnabled) return;
    
    const amplitude = Math.abs(sample);
    
    // Exponential Moving Average für Glättung
    this.vadLevel = (this.vadSmoothingFactor * this.vadLevel) + 
                    ((1 - this.vadSmoothingFactor) * amplitude);
    
    const previousSpeechDetected = this.speechDetected;
    this.speechDetected = this.vadLevel > this.vadThreshold;
    
    // VAD State Change Event senden
    if (this.speechDetected !== previousSpeechDetected) {
      this.port.postMessage({
        type: 'vad-change',
        speechDetected: this.speechDetected,
        vadLevel: this.vadLevel,
        timestamp: performance.now()
      });
    }
  }

  /**
   * Audio-Daten an Main Thread senden
   */
  sendAudioData() {
    // Nur senden wenn Sprache erkannt oder VAD deaktiviert
    if (!this.vadEnabled || this.speechDetected) {
      // Float32Array zu Int16Array konvertieren für WebRTC
      const int16Buffer = new Int16Array(this.bufferSize);
      for (let i = 0; i < this.bufferSize; i++) {
        // Clamp und konvertieren zu 16-bit
        const sample = Math.max(-1, Math.min(1, this.inputBuffer[i]));
        int16Buffer[i] = Math.round(sample * 32767);
      }
      
      // Audio-Daten senden
      this.port.postMessage({
        type: 'audio-data',
        audioData: int16Buffer.buffer,
        sampleRate: this.sampleRate,
        channelCount: this.channelCount,
        timestamp: performance.now(),
        vadLevel: this.vadLevel,
        speechDetected: this.speechDetected
      });
    }
  }

  /**
   * Performance-Statistiken aktualisieren
   */
  updateStats() {
    const now = performance.now();
    
    // Statistiken alle 5 Sekunden senden
    if (now - this.lastStatsTime > 5000) {
      const avgProcessingTime = this.processingTime / (this.processedSamples / 128);
      
      this.port.postMessage({
        type: 'performance-stats',
        stats: {
          processedSamples: this.processedSamples,
          avgProcessingTimePerBlock: avgProcessingTime,
          vadLevel: this.vadLevel,
          speechDetected: this.speechDetected,
          timestamp: now
        }
      });
      
      // Reset für nächste Periode
      this.lastStatsTime = now;
      this.processingTime = 0;
      this.processedSamples = 0;
    }
  }

  /**
   * Message Handler für Konfiguration
   */
  handleMessage(data) {
    switch (data.type) {
      case 'configure':
        this.configure(data.config);
        break;
        
      case 'set-gain':
        this.gainControl = Math.max(0, Math.min(2, data.gain));
        break;
        
      case 'set-noise-gate':
        this.noiseGate = Math.max(0, Math.min(1, data.threshold));
        break;
        
      case 'set-compression':
        this.compressionRatio = Math.max(1, Math.min(10, data.ratio));
        this.compressionThreshold = Math.max(0, Math.min(1, data.threshold));
        break;
        
      case 'set-vad':
        this.vadEnabled = data.enabled;
        this.vadThreshold = Math.max(0, Math.min(1, data.threshold));
        break;
        
      case 'stop':
        this.isProcessing = false;
        break;
        
      default:
        console.warn('[WebRTC Audio Worklet] Unbekannter Message Type:', data.type);
    }
  }

  /**
   * Worklet konfigurieren
   */
  configure(config) {
    if (config.gainControl !== undefined) {
      this.gainControl = config.gainControl;
    }
    
    if (config.noiseGate !== undefined) {
      this.noiseGate = config.noiseGate;
    }
    
    if (config.compressionRatio !== undefined) {
      this.compressionRatio = config.compressionRatio;
    }
    
    if (config.compressionThreshold !== undefined) {
      this.compressionThreshold = config.compressionThreshold;
    }
    
    if (config.vadEnabled !== undefined) {
      this.vadEnabled = config.vadEnabled;
    }
    
    if (config.vadThreshold !== undefined) {
      this.vadThreshold = config.vadThreshold;
    }
    
    console.log('[WebRTC Audio Worklet] Konfiguration aktualisiert', config);
    
    // Bestätigung senden
    this.port.postMessage({
      type: 'configured',
      config: {
        gainControl: this.gainControl,
        noiseGate: this.noiseGate,
        compressionRatio: this.compressionRatio,
        compressionThreshold: this.compressionThreshold,
        vadEnabled: this.vadEnabled,
        vadThreshold: this.vadThreshold
      }
    });
  }

  /**
   * Worklet Parameter Info
   */
  static get parameterDescriptors() {
    return [
      {
        name: 'gain',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 2.0,
        automationRate: 'a-rate'
      },
      {
        name: 'noiseGate',
        defaultValue: 0.01,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate'
      }
    ];
  }
}

// Worklet registrieren
registerProcessor('webrtc-audio-processor', WebRTCAudioProcessor);
