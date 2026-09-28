export class Limiter {
  private env = 0;
  private atk: number; private rel: number;
  constructor(sampleRate: number, private ceiling = 0.708 /* -3 dBFS */,
              attackMs = 1, releaseMs = 80) {
    this.atk = Math.exp(-1 / (sampleRate * attackMs / 1000));
    this.rel = Math.exp(-1 / (sampleRate * releaseMs / 1000));
  }
  processBlock(buf: Float32Array): number {
    let peakGr = 1;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      const target = a > this.ceiling ? this.ceiling / a : 1;
      const coef = target < this.env ? this.atk : this.rel;
      this.env = coef * this.env + (1 - coef) * target;
      buf[i] = buf[i] * this.env;
      if (this.env < peakGr) peakGr = this.env;
    }
    return peakGr;
  }
}
