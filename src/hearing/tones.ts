export interface TonePulseOpts {
  hz: number;
  levelDb: number; // 0 = full scale, negative = softer
  ear: 'left' | 'right';
  pulses?: number;
  durationMs?: number;
  gapMs?: number;
}

export async function playTone(ctx: AudioContext, o: TonePulseOpts): Promise<void> {
  const pulses = o.pulses ?? 3;
  const dur = (o.durationMs ?? 250) / 1000;
  const gap = (o.gapMs ?? 200) / 1000;
  const level = Math.pow(10, o.levelDb / 20);
  const osc = ctx.createOscillator();
  osc.type = 'sine'; osc.frequency.value = o.hz;
  const gain = ctx.createGain(); gain.gain.value = 0;
  const pan = new StereoPannerNode(ctx, { pan: o.ear === 'left' ? -1 : 1 });
  osc.connect(gain).connect(pan).connect(ctx.destination);
  const t0 = ctx.currentTime + 0.05;
  for (let i = 0; i < pulses; i++) {
    const start = t0 + i * (dur + gap);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.02);
    gain.gain.setValueAtTime(level, start + dur - 0.02);
    gain.gain.linearRampToValueAtTime(0, start + dur);
  }
  osc.start(t0);
  const end = t0 + pulses * (dur + gap);
  osc.stop(end + 0.02);
  await new Promise((r) => setTimeout(r, (end - ctx.currentTime + 0.05) * 1000));
}
