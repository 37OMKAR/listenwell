import { useEffect, useRef } from 'preact/hooks';
import { Engine } from '../../audio/engine';

export function Spectrum({ engine, active }: { engine: Engine; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const bufRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!active) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const c = canvasRef.current; if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
      return;
    }
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      const size = engine.getAnalyserSize();
      if (size === 0) { rafRef.current = requestAnimationFrame(draw); return; }
      if (!bufRef.current || bufRef.current.length !== size) bufRef.current = new Uint8Array(size);
      const buf = bufRef.current;
      engine.getSpectrum(buf);
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const bars = 48;
      const bin = Math.floor(size / bars);
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let k = 0; k < bin; k++) sum += buf[i * bin + k];
        const v = sum / bin / 255;
        const bh = Math.max(2, v * h);
        const hue = 200 - v * 140;
        ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
        const x = i * bw + 1;
        ctx.fillRect(x, h - bh, bw - 2, bh);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [active, engine]);

  return <canvas ref={canvasRef} width={600} height={80} class="spectrum" />;
}
