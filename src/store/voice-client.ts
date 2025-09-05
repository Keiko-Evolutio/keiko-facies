import { Player, Recorder } from '@/store/.';
import { WebSocketClient } from '@/store/websocket-client';

export interface ConsoleUpdate {
  id: string;
  type: 'console';
  payload: object;
}

export interface MessageUpdate {
  id: string;
  type: 'message';
  role: 'user' | 'assistant';
  content: string;
}

export interface FunctionUpdate {
  id: string;
  type: 'function';
  call_id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface FunctionCompletionUpdate {
  id: string;
  type: 'function_completion';
  call_id: string;
  output: string;
}

export interface AudioUpdate {
  id: string;
  type: 'audio';
  content: string;
}

export interface Content {
  type: 'text' | 'image' | 'video' | 'tool_calls';
  content: Array<Record<string, any>>;
}

export interface AgentUpdate {
  id: string;
  type: 'agent';
  call_id: string;
  name: string;
  status: string;
  information?: string;
  content?: Content;
  output?: boolean;
}

export interface InterruptUpdate {
  id: string;
  type: 'interrupt';
}

export interface SettingsUpdate {
  id: string;
  type: 'settings';
  settings: Record<string, any>;
}

export interface ErrorUpdate {
  id: string;
  type: 'error';
  message: string;
  error: string;
}

export type Update =
  | MessageUpdate
  | FunctionUpdate
  | AgentUpdate
  | AudioUpdate
  | ConsoleUpdate
  | InterruptUpdate
  | FunctionCompletionUpdate
  | SettingsUpdate
  | ErrorUpdate;

export class VoiceClient {
  url: string | URL;
  socket: WebSocketClient<Update, Update> | null;
  player: Player | null;
  recorder: Recorder | null;
  handleServerMessage: (update: Update) => Promise<void>;
  setAnalyzer: (analyzer: AnalyserNode) => void;
  private ttsPlaying: boolean;
  private lastBargeInAt: number;

  constructor(
    url: string | URL,
    handleServerMessage: (update: Update) => Promise<void>,
    setAnalyzer: (analyzer: AnalyserNode) => void,
  ) {
    this.url = url;
    this.handleServerMessage = handleServerMessage;
    this.setAnalyzer = setAnalyzer;
    this.socket = null;
    this.player = null;
    this.recorder = null;
    this.ttsPlaying = false;
    this.lastBargeInAt = 0;
  }

  async start(deviceId: string | null = null) {
    console.log('Starting voice client', this.url);
    this.socket = new WebSocketClient<Update, Update>(this.url);

    this.player = new Player(this.setAnalyzer);
    // Initialisiere Player mit Geräte-Standardrate (kein Argument), der Worklet resampled bei Bedarf
    await this.player.init({ upsampleMode: 'linear' });

    this.recorder = new Recorder((buffer: any) => {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send({ id: 'audio', type: 'audio', content: base64 });
      }
    }, (speech: boolean) => {
      // Client-seitige Barge-In: bei Sprachbeginn während TTS sofort unterbrechen
      // Client-VAD nur nutzen, wenn TTS gerade spielt (Barge-In) –
      // Server-VAD bleibt weiterhin aktiv und ergänzt die Erkennung
      if (speech) this.handleClientBargeIn();
    });

    let audio: MediaTrackConstraints = {
      sampleRate: 24000,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    } as any;

    if (deviceId) {
      console.log('Using device:', deviceId);
      audio = { ...audio, deviceId: { exact: deviceId } } as any;
    }

    console.log(audio);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio,
    });

    this.recorder.start(stream);
    this.startResponseListener();
  }

  async startResponseListener() {
    if (!this.socket) return;

    try {
      const isAudioResponse = (event: any): event is { type: 'audio_response'; audio: string } =>
        event.type === 'audio_response' && typeof event.audio === 'string';

      const isAudioEvent = (event: any): event is { type: 'audio'; content: string } =>
        event.type === 'audio' && typeof event.content === 'string';

      for await (const serverEvent of this.socket) {
        const event = serverEvent as any;

        if (isAudioResponse(event)) {
          const buffer = Uint8Array.from(atob(event.audio), (c) => c.charCodeAt(0)).buffer;
          this.player!.play(new Int16Array(buffer));
          this.ttsPlaying = true;
        } else if (isAudioEvent(event)) {
          const buffer = Uint8Array.from(atob(event.content), (c) => c.charCodeAt(0)).buffer;
          this.player!.play(new Int16Array(buffer));
          this.ttsPlaying = true;
        } else if (event.type === 'interrupt') {
          this.player!.clear();
          this.ttsPlaying = false;
        } else {
          await this.handleServerMessage(event);
        }
      }
    } catch (error) {
      console.error('Response iteration error:', error);
    }
  }

  /**
   * Client-seitige Barge-In Behandlung, ausgelöst durch VAD (optional).
   * Stoppt TTS-Wiedergabe sofort und informiert den Server, die Antwort abzubrechen.
   */
  private handleClientBargeIn() {
    const now = Date.now();
    // Cooldown 200ms, um Event-Flut zu vermeiden
    if (now - this.lastBargeInAt < 200) return;
    this.lastBargeInAt = now;
    if (this.ttsPlaying) {
      this.player?.clear();
      this.ttsPlaying = false;
      // Server-seitig Unterbrechung auslösen
      this.send({ id: 'interrupt', type: 'interrupt' } as any);
    }
  }

  async stop() {
    this.player?.clear();
    this.recorder?.stop();
    await this.socket?.close();
  }

  send(update: Update) {
    this.socket?.send(update);
  }

  mute_microphone() {
    this.recorder?.mute();
  }

  unmute_microphone() {
    this.recorder?.unmute();
  }

  sendUserMessage(message: string) {
    this.send({ id: 'message', type: 'message', role: 'user', content: message });
  }

  sendCreateResponse() {
    // Hinweis: Kein Interrupt beim Start senden. Optionale Steuer-Nachricht könnte hier implementiert werden,
    // z.B. { type: 'commit_audio' } oder ein explizites 'response.create' Kommando, falls der Server dies unterstützt.
    // Aktuell bewusst leer, um falsches Interrupt-Verhalten zu vermeiden.
  }
}

export default VoiceClient;
