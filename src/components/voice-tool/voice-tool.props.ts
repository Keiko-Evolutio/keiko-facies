export interface VoiceToolProps {
  onClick: () => void;
  callState: 'idle' | 'call';
  analyzer: AnalyserNode | null;
}
