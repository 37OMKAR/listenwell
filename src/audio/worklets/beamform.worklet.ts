/// <reference lib="webworker" />
// Delay-and-sum beamformer for a uniform linear mic array.
//
// Inputs:  N channels (2..8) from a single MediaStreamSource.
// Output:  1 channel, phase-aligned toward `angleDeg` (0 = forward / broadside).
//
// Fractional delays are applied per-channel with a linear-interp read from a
// short per-channel history buffer, then summed and normalized by N.
//
// Params via port.postMessage:
//   spacingCm : mic spacing (default 1.5 cm — laptop / phone arrays are tight)
//   angleDeg  : steer angle, -90..+90
//   enabled   : if false, output = channel 0 (passthrough)

const C_SOUND_CM_PER_S = 34300;  // 343 m/s

type Params = { spacingCm: number; angleDeg: number; enabled: boolean };

class BeamformProcessor extends AudioWorkletProcessor {
  private sr = sampleRate;
  private p: Params = { spacingCm: 1.5, angleDeg: 0, enabled: true };
  private history: Float32Array[] = [];
  private HIST = 64;  // max ~1.3 ms of history — enough for any hand-held array
  private writeIdx = 0;

  constructor() {
    super();
    this.port.onmessage = (e) => { Object.assign(this.p, e.data); };
  }

  private ensureHistory(nCh: number) {
    if (this.history.length !== nCh) {
      this.history = Array.from({ length: nCh }, () => new Float32Array(this.HIST));
      this.writeIdx = 0;
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const inp = inputs[0]; const out = outputs[0]?.[0];
    if (!inp || inp.length === 0 || !out) return true;
    const nCh = inp.length;
    const N = inp[0]?.length ?? 0;
    if (!N) return true;

    // Passthrough on 1-channel or when disabled
    if (nCh < 2 || !this.p.enabled) {
      const src = inp[0]; for (let i = 0; i < N; i++) out[i] = src[i] ?? 0;
      return true;
    }

    this.ensureHistory(nCh);

    // Delay in samples for channel k = k * (spacing/c) * sin(theta) * sr
    const theta = (this.p.angleDeg * Math.PI) / 180;
    const perChSamples = (this.p.spacingCm / C_SOUND_CM_PER_S) * Math.sin(theta) * this.sr;
    // Shift so all delays are >= 0 (delay = 0 for the "latest" mic on the source side).
    // For simplicity, apply (k - (nCh-1)/2) so mid-array = zero delay.
    const midK = (nCh - 1) / 2;
    const scale = 1 / nCh;
    const H = this.HIST;

    for (let i = 0; i < N; i++) {
      let sum = 0;
      // Push new samples into history
      for (let k = 0; k < nCh; k++) {
        const buf = this.history[k];
        buf[this.writeIdx] = inp[k][i] ?? 0;
      }

      for (let k = 0; k < nCh; k++) {
        const d = (k - midK) * perChSamples;
        // Clamp delay to buffer
        const dc = Math.max(0, Math.min(H - 2, d));
        const readPos = (this.writeIdx - dc + H) % H;
        const i0 = Math.floor(readPos);
        const frac = readPos - i0;
        const i1 = (i0 + 1) % H;
        const buf = this.history[k];
        const s = buf[i0] * (1 - frac) + buf[i1] * frac;
        sum += s;
      }
      out[i] = sum * scale;
      this.writeIdx = (this.writeIdx + 1) % H;
    }
    return true;
  }
}
registerProcessor('beamform-processor', BeamformProcessor);
