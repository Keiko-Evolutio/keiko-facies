/**
 * Diese Klasse implementiert einen AudioWorkletProcessor für die Wiedergabe von PCM-Audio-Daten.
 * Sie puffert eingehende Int16-Samples in einem Ringbuffer und gibt sie als Float32 aus.
 */
class BufferedPlaybackWorklet extends AudioWorkletProcessor {
  private buffer: Int16Array;
  private capacity: number = 4096;
  private tail: number = 0;
  private head: number = 0;
  private size: number = 0;
  private _isReady: boolean = false;
  private readonly MIN_QUEUE_SIZE_FOR_PLAYBACK: number = 1024;

  // Resampling-Optionen
  private sourceSampleRate: number;
  private upsampleMode: 'linear' | 'fir';

  constructor(options?: any) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.sourceSampleRate = Number(opts.sourceSampleRate || 24000);
    this.upsampleMode = (opts.upsampleMode || 'linear') as 'linear' | 'fir';
    // FIX: Entfernt - this.port = super.port; (nicht nötig, da this.port bereits verfügbar ist)
    this.buffer = new Int16Array(this.capacity);

    this.port.onmessage = ({ data }: MessageEvent<Int16Array | null>) => {
      if (data === null) {
        this.head = 0;
        this.tail = 0;
        this.size = 0;
        this._isReady = false;
        return;
      }
      this.appendToBuffer(data);
    };
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const outputChannel: Float32Array = outputs[0][0];
    const requiredSamples: number = outputChannel.length;

    if (!this._isReady && this.size >= this.MIN_QUEUE_SIZE_FOR_PLAYBACK) {
      this._isReady = true;
    }

    if (!this._isReady) {
      outputChannel.fill(0);
      return true;
    }

    if (this.size >= requiredSamples) {
      // Aus dem Ringpuffer lesen und bei Bedarf resamplen
      // Wir gehen davon aus, dass der AudioContext die Geräte-Rate nutzt (z. B. 48kHz)
      const deviceSampleRate = sampleRate; // globale Worklet-Variable
      if (deviceSampleRate === this.sourceSampleRate) {
        // Kein Resampling nötig
        const float32Chunk: Float32Array = new Float32Array(requiredSamples);
        for (let i: number = 0; i < requiredSamples; i++) {
          float32Chunk[i] = this.buffer[this.head] / 32768.0;
          this.head = (this.head + 1) % this.capacity;
        }
        this.size -= requiredSamples;
        outputChannel.set(float32Chunk);
      } else {
        // Resampling linear (einfach, schnell)
        const ratio = this.sourceSampleRate / deviceSampleRate;
        for (let i = 0; i < requiredSamples; i++) {
          // Quelle-Index im Ringpuffer (Float-Index)
          const srcIndexFloat = (this.head + Math.floor(i * ratio)) % this.capacity;
          const srcIndexNext = (srcIndexFloat + 1) % this.capacity;
          const s1 = this.buffer[srcIndexFloat] / 32768.0;
          const s2 = this.buffer[srcIndexNext] / 32768.0;
          const frac = (i * ratio) % 1;
          outputChannel[i] = s1 + (s2 - s1) * frac;
        }
        // Fortschritt im Puffer schätzen: entferne ungefähr die Menge, die zur Ausgabe korrespondiert
        const consumed = Math.min(this.size, Math.floor(requiredSamples * ratio));
        this.head = (this.head + consumed) % this.capacity;
        this.size -= consumed;
      }
    } else {
      outputChannel.fill(0);
      this._isReady = false;
    }

    return true;
  }

  private appendToBuffer(data: Int16Array): void {
    const dataLength: number = data.length;
    if (this.size + dataLength > this.capacity) {
      this.resizeBuffer(Math.max(this.capacity * 2, this.capacity + dataLength));
    }

    if (this.tail + dataLength <= this.capacity) {
      this.buffer.set(data, this.tail);
      this.tail += dataLength;
    } else {
      const firstPart: number = this.capacity - this.tail;
      this.buffer.set(data.subarray(0, firstPart), this.tail);
      this.buffer.set(data.subarray(firstPart), 0);
      this.tail = dataLength - firstPart;
    }

    this.size += dataLength;
  }

  private resizeBuffer(newCapacity: number): void {
    const newBuffer: Int16Array = new Int16Array(newCapacity);
    if (this.head < this.tail) {
      newBuffer.set(this.buffer.subarray(this.head, this.tail), 0);
    } else {
      const firstPart: number = this.capacity - this.head;
      newBuffer.set(this.buffer.subarray(this.head), 0);
      newBuffer.set(this.buffer.subarray(0, this.tail), firstPart);
    }
    this.buffer = newBuffer;
    this.head = 0;
    this.tail = this.size;
    this.capacity = newCapacity;
  }
}

registerProcessor('buffered-playback-worklet', BufferedPlaybackWorklet);
