/**
 * AudioWorklet-Typen für Keiko Personal Assistant
 *
 * Diese Datei definiert die notwendigen AudioWorklet-Typen
 * ohne Konflikte mit TypeScript's DOM-Typen.
 */

interface AudioWorkletGlobalScope extends WorkerGlobalScope {
  readonly sampleRate: number;
  readonly currentFrame: number;
  readonly currentTime: number;

  registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
}

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;

  constructor(options?: AudioWorkletNodeOptions);

  static get parameterDescriptors(): AudioParamDescriptor[] | undefined;

  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

interface AudioWorkletNodeOptions extends AudioNodeOptions {
  numberOfInputs?: number;
  numberOfOutputs?: number;
  outputChannelCount?: number[];
  parameterData?: Record<string, number>;
  processorOptions?: any;
}

interface AudioParamDescriptor {
  name: string;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  automationRate?: AutomationRate;
}

type AutomationRate = 'a-rate' | 'k-rate';

declare var AudioWorkletProcessor: {
  prototype: AudioWorkletProcessor;
  new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
};

// Globale Variablen für AudioWorklet-Scope
declare var registerProcessor: (name: string, processor: typeof AudioWorkletProcessor) => void;
declare var sampleRate: number;
declare var currentFrame: number;
declare var currentTime: number;
