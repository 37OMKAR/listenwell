export interface CompressorOpts {
  sampleRate: number;
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  makeupDb: number;
}

const DB_EPS = 1e-6;
const toDb = (x: number) => 20 * Math.log10(Math.max(Math.abs(x), DB_EPS));
const fromDb = (db: number) => Math.pow(10, db / 20);

export class Compressor {
  private envDb = -120;
  private atk: number; private rel: number;
  constructor(private opts: CompressorOpts) {
    this.atk = Math.exp(-1 / (opts.sampleRate * opts.attackMs / 1000));
    this.rel = Math.exp(-1 / (opts.sampleRate * opts.releaseMs / 1000));
  }
  update(o: Partial<CompressorOpts>) {
    Object.assign(this.opts, o);
    this.atk = Math.exp(-1 / (this.opts.sampleRate * this.opts.attackMs / 1000));
    this.rel = Math.exp(-1 / (this.opts.sampleRate * this.opts.releaseMs / 1000));
  }
  processBlock(buf: Float32Array) {
    const { thresholdDb, ratio, makeupDb } = this.opts;
    const makeup = fromDb(makeupDb);
    for (let i = 0; i < buf.length; i++) {
      const inDb = toDb(buf[i]);
      const coef = inDb > this.envDb ? this.atk : this.rel;
      this.envDb = coef * this.envDb + (1 - coef) * inDb;
      let gainDb = 0;
      if (this.envDb > thresholdDb) {
        gainDb = (thresholdDb - this.envDb) * (1 - 1 / ratio);
      }
      buf[i] = buf[i] * fromDb(gainDb) * makeup;
    }
  }
}
