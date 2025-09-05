/**
 * Diese Klasse implementiert einen AudioWorkletProcessor zur Verarbeitung von PCM-Audio-Daten.
 * Sie konvertiert eingehende Float32-Audio-Samples in Int16-Format und sendet diese über den Port.
 */
class PCMProcessor extends AudioWorkletProcessor {
  // FIX: Entfernt - readonly port: MessagePort; (bereits in Basisklasse verfügbar)

  // Einfache VAD-Parameter
  // Schwelle als RMS-Energie, zwischen 0 und 1 (Float32 PCM)
  private vadThreshold: number = 0.02;
  private minSpeechSeconds: number = 0.03; // mindestens 30ms Sprache für Aktivierung
  private minSilenceSeconds: number = 0.15; // mindestens 150ms Stille für Deaktivierung
  private isSpeech: boolean = false;
  private lastAboveTs: number = 0;
  private lastBelowTs: number = 0;

  constructor() {
    super();
    // FIX: Entfernt - this.port = super.port; (nicht nötig, da this.port bereits verfügbar ist)
  }

  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const input: Float32Array[] = inputs[0];
    if (input?.length > 0) {
      const float32Buffer: Float32Array = input[0];

      // VAD: RMS-Energie berechnen
      let sumSq = 0.0;
      for (let i = 0; i < float32Buffer.length; i++) {
        const s = float32Buffer[i];
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / Math.max(1, float32Buffer.length));

      const now = currentTime; // AudioContext-Zeit in Sekunden

      if (rms >= this.vadThreshold) {
        this.lastAboveTs = now;
        // Aktivieren, wenn lange genug über Schwelle
        if (!this.isSpeech) {
          const aboveDuration = now - this.lastBelowTs; // Zeit seit dem letzten Unterschreiten
          // Für Aktivierung zählt aktuelle Über-Schwellen-Zeit – approximieren mit minSpeechSeconds
          if ((this.lastAboveTs - (this.lastBelowTs || now)) >= this.minSpeechSeconds) {
            this.isSpeech = true;
            this.port.postMessage({ type: 'vad', speech: true, energy: rms });
          } else {
            // Sofortige Aktivierung ohne zusätzliche Verzögerung: heuristisch
            this.isSpeech = true;
            this.port.postMessage({ type: 'vad', speech: true, energy: rms });
          }
        }
      } else {
        // Unterhalb Schwelle
        if (this.lastBelowTs === 0) {
          this.lastBelowTs = now;
        }
        // Deaktivieren, wenn lange genug unter Schwelle
        if (this.isSpeech && now - this.lastAboveTs >= this.minSilenceSeconds) {
          this.isSpeech = false;
          this.port.postMessage({ type: 'vad', speech: false, energy: rms });
          this.lastBelowTs = now;
        }
      }

      // PCM16 konvertieren und an Main-Thread senden
      const int16Buffer: Int16Array = this.convertFloat32ToInt16(float32Buffer);
      this.port.postMessage(int16Buffer);
    }
    return true;
  }

  private convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
    const length: number = float32Array.length;
    const int16Array: Int16Array = new Int16Array(length);
    for (let i: number = 0; i < length; i++) {
      let val: number = float32Array[i] * 32767;
      val = Math.max(-32768, Math.min(32767, val));
      int16Array[i] = val | 0;
    }
    return int16Array;
  }
}

registerProcessor('pcm-converter-worklet', PCMProcessor);
