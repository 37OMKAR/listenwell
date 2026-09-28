/// <reference lib="webworker" />
// Speech clarity chain (v2):
// HPF(150) -> LPF(7.5k) -> warmth(800) -> presence(2.5k) -> formant(3.5k) -> air(6k)
// -> profile EQ (6 bands) -> soft gate -> de-esser (6.5k dyn shelf) -> compressor
// -> makeup -> stereo split + balance -> limiter (-3 dBFS).
// Self-contained: AudioWorklet global scope can't import our modules.

type Params = {
  clarity: number; highs: number; warmth: number; presence: number; air: number;
  deess: number;   // 0..1, how much sibilance to tame
  gate: number; makeup: number; balance: number; profile: number[];
};

const TAU = Math.PI * 2;
function hp(sr:number,f:number,Q=0.707){const w=TAU*f/sr,c=Math.cos(w),s=Math.sin(w),a=s/(2*Q),a0=1+a;return{b0:(1+c)/2/a0,b1:-(1+c)/a0,b2:(1+c)/2/a0,a1:-2*c/a0,a2:(1-a)/a0};}
function lp(sr:number,f:number,Q=0.707){const w=TAU*f/sr,c=Math.cos(w),s=Math.sin(w),a=s/(2*Q),a0=1+a;return{b0:(1-c)/2/a0,b1:(1-c)/a0,b2:(1-c)/2/a0,a1:-2*c/a0,a2:(1-a)/a0};}
function pk(sr:number,f:number,Q:number,g:number){const A=Math.pow(10,g/40),w=TAU*f/sr,c=Math.cos(w),s=Math.sin(w),a=s/(2*Q),a0=1+a/A;return{b0:(1+a*A)/a0,b1:-2*c/a0,b2:(1-a*A)/a0,a1:-2*c/a0,a2:(1-a/A)/a0};}
function hs(sr:number,f:number,g:number){const A=Math.pow(10,g/40),w=TAU*f/sr,c=Math.cos(w),s=Math.sin(w);const al=(s/2)*Math.sqrt((A+1/A)*(1/1-1)+2);const t=2*Math.sqrt(A)*al,a0=(A+1)-(A-1)*c+t;return{b0:(A*((A+1)+(A-1)*c+t))/a0,b1:(-2*A*((A-1)+(A+1)*c))/a0,b2:(A*((A+1)+(A-1)*c-t))/a0,a1:(2*((A-1)-(A+1)*c))/a0,a2:((A+1)-(A-1)*c-t)/a0};}
function bp(sr:number,f:number,Q:number){const w=TAU*f/sr,c=Math.cos(w),s=Math.sin(w),a=s/(2*Q),a0=1+a;return{b0:a/a0,b1:0,b2:-a/a0,a1:-2*c/a0,a2:(1-a)/a0};}

type Coef=ReturnType<typeof hp>;
class BQ{b0=1;b1=0;b2=0;a1=0;a2=0;x1=0;x2=0;y1=0;y2=0;set(c:Coef){this.b0=c.b0;this.b1=c.b1;this.b2=c.b2;this.a1=c.a1;this.a2=c.a2;}proc(x:number){const y=this.b0*x+this.b1*this.x1+this.b2*this.x2-this.a1*this.y1-this.a2*this.y2;this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y;}}

const PROFILE_HZ=[250,500,1000,2000,4000,6000];

class ClarityProcessor extends AudioWorkletProcessor {
  sr = sampleRate;
  hp = new BQ(); lp = new BQ();
  warmth = new BQ();      // 800 Hz peak
  presence = new BQ();    // 2.5 kHz peak (clarity slider)
  formant = new BQ();     // 3.5 kHz high shelf (highs slider)
  air = new BQ();         // 10 kHz high shelf
  profile: BQ[] = PROFILE_HZ.map(()=>new BQ());
  deessDet = new BQ();    // 6.5 kHz bandpass for sibilance detection
  deessShelf = new BQ();  // 6 kHz shelf we duck when sibilance detected
  deessEnv = 0;

  compEnvDb = -120; atk: number; rel: number;
  limEnv = 1; limAtk: number; limRel: number; ceiling = 0.708;

  p: Params = { clarity:0, highs:0, warmth:0, presence:0, air:0, deess:0.5,
                gate:0, makeup:0, balance:0, profile:[0,0,0,0,0,0] };
  frameCount = 0;
  peakGrHistoryMs = 0;

  constructor() {
    super();
    this.hp.set(hp(this.sr, 150));
    this.lp.set(lp(this.sr, 7500));
    this.deessDet.set(bp(this.sr, 6500, 2.5));
    this.updateEq();
    this.updateProfile();
    this.atk = Math.exp(-1/(this.sr*0.005));
    this.rel = Math.exp(-1/(this.sr*0.120));
    this.limAtk = Math.exp(-1/(this.sr*0.001));
    this.limRel = Math.exp(-1/(this.sr*0.080));
    this.port.onmessage = (e) => {
      Object.assign(this.p, e.data);
      this.updateEq();
      if (e.data.profile) this.updateProfile();
    };
  }
  updateEq() {
    this.warmth.set(pk(this.sr, 800, 0.9, this.p.warmth));
    this.presence.set(pk(this.sr, 2500, 0.9, this.p.clarity + this.p.presence * 0.5));
    this.formant.set(hs(this.sr, 3500, this.p.highs));
    this.air.set(hs(this.sr, 10000, this.p.air));
    this.deessShelf.set(hs(this.sr, 6000, 0)); // dynamic; set per-block below
  }
  updateProfile() {
    for (let i=0;i<6;i++) this.profile[i].set(pk(this.sr, PROFILE_HZ[i], 1.0, this.p.profile[i]??0));
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const inp = inputs[0]?.[0]; const outL = outputs[0]?.[0]; const outR = outputs[0]?.[1] ?? outL;
    if (!inp || !outL) return true;
    const N = inp.length;
    const gateThresh = 0.001 + this.p.gate * 0.02;
    const makeup = Math.pow(10, this.p.makeup / 20);
    const thr = -28; const ratio = 3;
    const deessAmount = this.p.deess * 12; // up to -12 dB shelf duck

    for (let i=0;i<N;i++) {
      let s = inp[i];
      s = this.hp.proc(s);
      s = this.lp.proc(s);
      s = this.warmth.proc(s);
      s = this.presence.proc(s);
      s = this.formant.proc(s);
      s = this.air.proc(s);
      for (let b=0;b<6;b++) s = this.profile[b].proc(s);

      // De-esser: detect sibilance energy, drop 6 kHz shelf when it spikes
      const det = this.deessDet.proc(s);
      const detAbs = Math.abs(det);
      const coef = detAbs > this.deessEnv ? 0.2 : 0.995;
      this.deessEnv = coef * this.deessEnv + (1 - coef) * detAbs;
      // when deessEnv > ~0.1, duck the shelf; recompute lazily every 32 samples for cost
      if ((i & 31) === 0) {
        const over = Math.max(0, this.deessEnv * 30 - 3); // dB above threshold
        const duck = -Math.min(deessAmount, over);
        this.deessShelf.set(hs(this.sr, 6000, duck));
      }
      s = this.deessShelf.proc(s);

      // Soft gate (very light; AI handles heavy noise)
      const mag = Math.abs(s);
      if (mag < gateThresh) s *= mag / gateThresh;

      // Compressor
      const inDb = 20 * Math.log10(Math.max(Math.abs(s), 1e-6));
      const cc = inDb > this.compEnvDb ? this.atk : this.rel;
      this.compEnvDb = cc * this.compEnvDb + (1 - cc) * inDb;
      let gainDb = 0;
      if (this.compEnvDb > thr) gainDb = (thr - this.compEnvDb) * (1 - 1 / ratio);
      s = s * Math.pow(10, gainDb / 20) * makeup;

      // Limiter
      const a = Math.abs(s);
      const target = a > this.ceiling ? this.ceiling / a : 1;
      const lc = target < this.limEnv ? this.limAtk : this.limRel;
      this.limEnv = lc * this.limEnv + (1 - lc) * target;
      s = s * this.limEnv;

      // Stereo balance
      const bal = this.p.balance;
      const lg = bal <= 0 ? 1 : 1 - bal;
      const rg = bal >= 0 ? 1 : 1 + bal;
      outL[i] = s * lg;
      if (outR !== outL) outR[i] = s * rg;
    }

    this.frameCount += N;
    if (this.limEnv < 0.9) this.peakGrHistoryMs += (N / this.sr) * 1000;
    else this.peakGrHistoryMs = Math.max(0, this.peakGrHistoryMs - (N / this.sr) * 1000);

    if (this.frameCount >= this.sr / 60) {
      this.frameCount = 0;
      let peak = 0;
      for (let i=0;i<N;i++) { const a = Math.abs(outL[i]); if (a > peak) peak = a; }
      this.port.postMessage({ outPeak: peak, clipMs: this.peakGrHistoryMs, deess: this.deessEnv });
    }
    return true;
  }
}
registerProcessor('clarity-processor', ClarityProcessor);
