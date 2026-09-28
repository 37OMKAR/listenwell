/// <reference lib="webworker" />
class MeterProcessor extends AudioWorkletProcessor {
  private acc = 0;
  private frames = 0;
  private peak = 0;
  constructor() {
    super();
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (!inp) return true;
    for (let i = 0; i < inp.length; i++) {
      const a = Math.abs(inp[i]);
      if (a > this.peak) this.peak = a;
      if (out) out[i] = inp[i];
    }
    this.frames += inp.length;
    if (this.frames >= sampleRate / 30) {
      this.port.postMessage({ peak: this.peak });
      this.peak = 0;
      this.frames = 0;
      this.acc = 0;
    }
    return true;
  }
}
registerProcessor('meter-processor', MeterProcessor);
