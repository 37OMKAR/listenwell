// Cookbook biquad (Audio EQ Cookbook by RBJ), direct form I.
export type BiquadCoefs = { b0: number; b1: number; b2: number; a1: number; a2: number };

export class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;

  set(c: BiquadCoefs) {
    this.b0 = c.b0; this.b1 = c.b1; this.b2 = c.b2; this.a1 = c.a1; this.a2 = c.a2;
  }
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }

  processBlock(buf: Float32Array) {
    for (let i = 0; i < buf.length; i++) buf[i] = this.process(buf[i]);
  }
}

const TAU = Math.PI * 2;

export function highpass(sr: number, f: number, Q = 0.707): BiquadCoefs {
  const w0 = TAU * f / sr;
  const cosW = Math.cos(w0), sinW = Math.sin(w0);
  const alpha = sinW / (2 * Q);
  const a0 = 1 + alpha;
  return {
    b0: (1 + cosW) / 2 / a0,
    b1: -(1 + cosW) / a0,
    b2: (1 + cosW) / 2 / a0,
    a1: -2 * cosW / a0,
    a2: (1 - alpha) / a0,
  };
}

export function lowpass(sr: number, f: number, Q = 0.707): BiquadCoefs {
  const w0 = TAU * f / sr;
  const cosW = Math.cos(w0), sinW = Math.sin(w0);
  const alpha = sinW / (2 * Q);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cosW) / 2 / a0,
    b1: (1 - cosW) / a0,
    b2: (1 - cosW) / 2 / a0,
    a1: -2 * cosW / a0,
    a2: (1 - alpha) / a0,
  };
}

export function peaking(sr: number, f: number, Q: number, gainDb: number): BiquadCoefs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = TAU * f / sr;
  const cosW = Math.cos(w0), sinW = Math.sin(w0);
  const alpha = sinW / (2 * Q);
  const a0 = 1 + alpha / A;
  return {
    b0: (1 + alpha * A) / a0,
    b1: -2 * cosW / a0,
    b2: (1 - alpha * A) / a0,
    a1: -2 * cosW / a0,
    a2: (1 - alpha / A) / a0,
  };
}

export function highShelf(sr: number, f: number, gainDb: number, S = 1): BiquadCoefs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = TAU * f / sr;
  const cosW = Math.cos(w0), sinW = Math.sin(w0);
  const alpha = (sinW / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
  const twoSqrtAalpha = 2 * Math.sqrt(A) * alpha;
  const a0 = (A + 1) - (A - 1) * cosW + twoSqrtAalpha;
  return {
    b0: (A * ((A + 1) + (A - 1) * cosW + twoSqrtAalpha)) / a0,
    b1: (-2 * A * ((A - 1) + (A + 1) * cosW)) / a0,
    b2: (A * ((A + 1) + (A - 1) * cosW - twoSqrtAalpha)) / a0,
    a1: (2 * ((A - 1) - (A + 1) * cosW)) / a0,
    a2: ((A + 1) - (A - 1) * cosW - twoSqrtAalpha) / a0,
  };
}
