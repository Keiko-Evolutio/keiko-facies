import styles from './voice-tool.module.scss';
import { TfiThemifyFavicon } from 'react-icons/tfi';
import { LuBrainCircuit } from 'react-icons/lu';
import { type FC, useEffect, useRef, useState } from 'react';
import type { VoiceToolProps } from '@/components/voice-tool/voice-tool.props.ts';

const VoiceTool: FC<VoiceToolProps> = ({ onClick, callState, analyzer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [talking, setTalking] = useState(false);

  useEffect(() => {
    if (callState === 'call' && analyzer && canvasRef.current) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const width = canvas.width;
      const height = canvas.height;
      let sum = 0;
      if (context) {
        const draw = () => {
          if (callState === 'call' && analyzer) {
            requestAnimationFrame(draw);
          }
          if (!analyzer) return;

          context.clearRect(0, 0, width, height);
          context.fillStyle = 'rgb(255, 255, 255, 0)';
          context.fillRect(0, 0, width, height);

          analyzer.getByteFrequencyData(dataArray);
          context.strokeStyle = 'rgb(255, 255, 255, 0.1)';

          sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            const radius = (100 * dataArray[i]) / 255 + 50;
            sum += dataArray[i];
            context.beginPath();
            context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
            context.stroke();
          }
          setTalking(sum > 0);
        };
        draw();
      }
    }
  }, [analyzer, callState]);

  return (
    <div className={'absolute bottom-0 left-9/20 transform -translate-x-1/2 -translate-y-1/2'}>
      <div className={callState === 'call' ? styles.call : styles.idle} onClick={onClick}>
        {talking ? <TfiThemifyFavicon size={48} /> : <LuBrainCircuit size={48} />}
      </div>
    </div>
  );
};

export default VoiceTool;
