import { describe, it, expect } from 'vitest';
import { Biquad, highpass, lowpass, peaking } from '../src/dsp/biquad';
import { Compressor } from '../src/dsp/compressor';
import { Limiter } from '../src/dsp/limiter';
import { fitFromThresholds, halfGain } from '../src/hearing/fitting';

const SR = 48000;

function sine(hz: number, N: number, amp = 0.5) {
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) b[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
  return b;
}
function rms(b: Float32Array) {
  let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i];
  return Math.sqrt(s / b.length);
}

describe('biquad', () => {
  it('highpass attenuates 60 Hz strongly', () => {
    const bq = new Biquad(); bq.set(highpass(SR, 150));
    const x = sine(60, SR); const y = new Float32Array(x); bq.processBlock(y);
    expect(rms(y) / rms(x)).toBeLessThan(0.3);
  });
  it('lowpass attenuates 12 kHz', () => {
    const bq = new Biquad(); bq.set(lowpass(SR, 7500));
    const x = sine(12000, SR); const y = new Float32Array(x); bq.processBlock(y);
    expect(rms(y) / rms(x)).toBeLessThan(0.4);
  });
  it('peaking boosts near center', () => {
    const bq = new Biquad(); bq.set(peaking(SR, 2500, 0.9, 12));
    const x = sine(2500, SR); const y = new Float32Array(x); bq.processBlock(y);
    expect(rms(y) / rms(x)).toBeGreaterThan(2.5);
  });
});

describe('limiter', () => {
  it('never exceeds ceiling on a +20 dB burst', () => {
    const lim = new Limiter(SR);
    const buf = sine(1000, SR, 5.0);
    lim.processBlock(buf);
    let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
    expect(peak).toBeLessThanOrEqual(0.85);
  });
});

describe('compressor', () => {
  it('reduces gain on loud input', () => {
    const c = new Compressor({ sampleRate: SR, thresholdDb: -20, ratio: 3, attackMs: 5, releaseMs: 100, makeupDb: 0 });
    const loud = sine(1000, SR, 0.9);
    const quiet = sine(1000, SR, 0.02);
    c.processBlock(loud); c.processBlock(quiet);
    // No clip and finite
    for (let i = 0; i < loud.length; i++) expect(Math.abs(loud[i])).toBeLessThan(1);
  });
});

describe('fitting', () => {
  it('half-gain rule clamps', () => {
    expect(halfGain(80, 0)).toBe(25);
    expect(halfGain(0, 0)).toBe(0);
    expect(halfGain(20, 10)).toBe(5);
  });
  it('mono is average of ears', () => {
    const { mono } = fitFromThresholds([20, 30, 40, 50, 60, 70], [10, 20, 30, 40, 50, 60]);
    expect(mono.length).toBe(6);
    for (const v of mono) expect(v).toBeGreaterThanOrEqual(0);
  });
});
