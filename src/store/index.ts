export interface VoiceConfiguration {
  inputDeviceId: string;
  detectionType: 'semantic_vad' | 'server_vad';
  transcriptionModel: string;
  threshold: number;
  silenceDuration: number;
  prefixPadding: number;
  eagerness: 'low' | 'medium' | 'high' | 'auto';
  voice: string;
  transport?: 'websocket' | 'webrtc';
  upsampleMode?: 'linear' | 'fir';
}

export const defaultVoices = [
  { name: 'Alloy', value: 'alloy' },
  { name: 'Ash', value: 'ash' },
  { name: 'Ballad', value: 'ballad' },
  { name: 'Coral', value: 'coral' },
  { name: 'Echo', value: 'echo' },
  { name: 'Sage', value: 'sage' },
  { name: 'Shimmer', value: 'shimmer' },
  { name: 'Verse', value: 'verse' },
];

export const defaultEagerness = [
  { name: 'Low', value: 'low' },
  { name: 'Medium', value: 'medium' },
  { name: 'High', value: 'high' },
  { name: 'Auto', value: 'auto' },
];

export const defaultConfiguration: VoiceConfiguration = {
  inputDeviceId: 'default',
  detectionType: 'server_vad',
  transcriptionModel: 'whisper-1',
  threshold: 0.8,
  silenceDuration: 500,
  prefixPadding: 300,
  eagerness: 'auto',
  voice: 'sage',
  transport: 'websocket',
  upsampleMode: 'linear',
};

export class Player {
  private playbackNode: AudioWorkletNode | null = null;
  setAnalyzer: (analyzer: AnalyserNode) => void;

  constructor(setAnalyzer: (analyzer: AnalyserNode) => void) {
    this.setAnalyzer = setAnalyzer;
  }

  /**
   * Initialisiert den AudioWorkletNode für die Wiedergabe und verbindet ihn mit einem AnalyserNode.
   * @param opts - Optionen für AudioContext und Worklet (sampleRate optional, upsampleMode optional)
   */
  async init(opts?: { sampleRate?: number; upsampleMode?: 'linear' | 'fir' }) {
    const audioContext = opts?.sampleRate ? new AudioContext({ sampleRate: opts.sampleRate }) : new AudioContext();
    try {
      // Verwende die kompilierte JS-Datei im Build-Modus, Proxy im Dev-Modus
      await audioContext.audioWorklet.addModule('/worklets/buffered-playback-worklet.js');
      this.playbackNode = new AudioWorkletNode(audioContext, 'buffered-playback-worklet', {
        processorOptions: {
          sourceSampleRate: 24000,
          upsampleMode: opts?.upsampleMode || 'linear',
        },
      });
      this.playbackNode.connect(audioContext.destination);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.85;
      this.playbackNode.connect(analyser);
      this.setAnalyzer(analyser);
    } catch (error) {
      console.error('Fehler beim Laden des Playback-Worklet-Moduls:', error);
      throw error;
    }
  }

  /**
   * Sendet einen Puffer mit Int16-Samples an den Playback-Worklet.
   * @param buffer - Die zu spielenden Int16-Samples.
   */
  play(buffer: Int16Array) {
    if (this.playbackNode) {
      this.playbackNode.port.postMessage(buffer);
    }
  }

  /**
   * Leert den Puffer des Playback-Worklets.
   */
  clear() {
    if (this.playbackNode) {
      this.playbackNode.port.postMessage(null);
    }
  }
}

export class Recorder {
  onDataAvailable: (buffer: ArrayBuffer) => void;
  onVadEvent?: (speech: boolean, energy?: number) => void;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private muted: boolean = true;

  public constructor(onDataAvailable: (buffer: ArrayBuffer) => void, onVadEvent?: (speech: boolean, energy?: number) => void) {
    this.onDataAvailable = onDataAvailable;
    this.onVadEvent = onVadEvent;
  }

  /**
   * Startet die Aufnahme mit dem angegebenen MediaStream.
   * @param stream - Der MediaStream mit dem Audio-Eingang.
   */
  async start(stream: MediaStream) {
    try {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      await this.audioContext.audioWorklet.addModule('/worklets/pcm-converter-worklet.js');
      this.mediaStream = stream;
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-converter-worklet');
      let buffer: Uint8Array[] = [];
      let bufferSize = 0;
      // Zielgröße für ~20–30ms Chunks bei 24kHz PCM16 (2 Bytes/Sample):
      // 24k Samples/s * 2 B/Sample = 48k B/s → 20ms ≈ 960 B, 30ms ≈ 1440 B
      const targetSize = 1440;

      this.workletNode.port.onmessage = (event) => {
        // VAD-Ereignisse vom Worklet
        if (event?.data && typeof event.data === 'object' && event.data.type === 'vad') {
          try {
            this.onVadEvent?.(!!event.data.speech, Number(event.data.energy ?? 0));
          } catch (e) {
            // VAD-Handler darf Fehler nicht propagieren
            console.debug('VAD handler error', e);
          }
          return;
        }
        if (this.muted) {
          return;
        }
        const data = new Uint8Array(event.data.buffer);
        buffer.push(data);
        bufferSize += data.byteLength;

        if (bufferSize >= targetSize) {
          const concatenatedBuffer = new Uint8Array(bufferSize);
          let offset = 0;
          for (const chunk of buffer) {
            concatenatedBuffer.set(chunk, offset);
            offset += chunk.byteLength;
          }
          this.onDataAvailable(concatenatedBuffer.buffer);
          buffer = [];
          bufferSize = 0;
        }
      };

      this.mediaStreamSource.connect(this.workletNode);
      // Feedback-Schleife verhindern: Worklet über stummen GainNode an den Ausgang anschließen
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0.0;
      this.workletNode.connect(silentGain);
      silentGain.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Fehler beim Starten der Aufnahme:', error);
      this.stop();
    }
  }

  /**
   * Stummschaltung des Mikrofons aktivieren.
   */
  mute() {
    this.muted = true;
  }

  /**
   * Stummschaltung des Mikrofons deaktivieren.
   */
  unmute() {
    this.muted = false;
  }

  /**
   * Beendet die Aufnahme und räumt auf.
   */
  stop() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
