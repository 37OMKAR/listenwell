import { defaultParams, EngineParams, ModelId } from './params';
import { makeModelNode } from '../models/loaders';
import clarityWorkletUrl from './worklets/clarity.worklet.ts?worker&url';
import meterWorkletUrl from './worklets/meter.worklet.ts?worker&url';
import beamformWorkletUrl from './worklets/beamform.worklet.ts?worker&url';

const dB = (v: number) => Math.pow(10, v / 20);

export interface Meters {
  inPeak: number;
  outPeak: number;
  clipMs: number;
}

export class Engine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private wakeLock: any = null;
  private micGainNode: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private dryDelay: DelayNode | null = null;
  private mixSum: GainNode | null = null;
  private clarity: AudioWorkletNode | null = null;
  private boost: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private inMeter: AudioWorkletNode | null = null;
  private outMeter: AudioWorkletNode | null = null;
  private model: AudioNode | null = null;
  private modelId: ModelId = 'off';
  private currentParams: EngineParams = { ...defaultParams };

  private analyser: AnalyserNode | null = null;
  private beamform: AudioWorkletNode | null = null;
  private micChannels = 1;

  onMeters?: (m: Meters) => void;
  onDelayMs?: (d: number) => void;
  onArrayInfo?: (info: { channels: number; beamforming: boolean }) => void;

  getSpectrum(out: Uint8Array): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(out);
    return true;
  }
  getAnalyserSize(): number { return this.analyser?.frequencyBinCount ?? 0; }

  private meters: Meters = { inPeak: 0, outPeak: 0, clipMs: 0 };

  get running() { return this.ctx !== null; }

  async start(opts: { micId?: string; outId?: string; params?: EngineParams }) {
    if (this.ctx) return;
    const params = opts.params ?? this.currentParams;
    this.currentParams = { ...params };

    // Request the raw mic array if the device exposes multiple channels.
    // Browsers that don't honour a >1 channelCount silently downmix to mono; safe.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: opts.micId ? { exact: opts.micId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 4 } as any,
        sampleRate: { ideal: 48000 } as any,
      },
    });
    this.stream = stream;
    const settings = stream.getAudioTracks()[0]?.getSettings() as any;
    const nCh = Math.max(1, (settings?.channelCount as number) || 1);
    this.micChannels = nCh;

    const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    await ctx.resume();
    this.ctx = ctx;

    await ctx.audioWorklet.addModule(clarityWorkletUrl);
    await ctx.audioWorklet.addModule(meterWorkletUrl);
    await ctx.audioWorklet.addModule(beamformWorkletUrl);

    const mic = ctx.createMediaStreamSource(stream);
    // Beamformer: N-channel in, 1-channel out. Passes through when nCh<2 or disabled.
    const beamform = new AudioWorkletNode(ctx, 'beamform-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: nCh,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    });
    beamform.port.postMessage({
      spacingCm: params.arraySpacingCm ?? 1.5,
      angleDeg: params.beamAngle ?? 0,
      enabled: (params.beamform ?? true) && nCh >= 2,
    });
    this.beamform = beamform;
    this.onArrayInfo?.({ channels: nCh, beamforming: nCh >= 2 && (params.beamform ?? true) });

    const micGain = ctx.createGain(); micGain.gain.value = dB(params.micGain);
    const inMeter = new AudioWorkletNode(ctx, 'meter-processor');
    inMeter.port.onmessage = (e) => { this.meters.inPeak = e.data.peak ?? 0; this.emit(); };

    const model = await makeModelNode(ctx, params.model);
    this.modelId = params.model;

    const wet = ctx.createGain(); wet.gain.value = params.wetDry;
    const dry = ctx.createGain(); dry.gain.value = 1 - params.wetDry;
    const dryDelay = ctx.createDelay(0.2);
    dryDelay.delayTime.value = 0.010; // 10ms default; adjust per model

    const mixSum = ctx.createGain();
    const clarity = new AudioWorkletNode(ctx, 'clarity-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.sendClarityParams(clarity, params);
    clarity.port.onmessage = (e) => {
      if (e.data.outPeak !== undefined) this.meters.outPeak = e.data.outPeak;
      if (e.data.clipMs !== undefined) this.meters.clipMs = e.data.clipMs;
      this.emit();
    };

    const boost = ctx.createGain(); boost.gain.value = dB(params.volume);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.08;

    const outMeter = new AudioWorkletNode(ctx, 'meter-processor');
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    this.analyser = analyser;

    // wire graph: mic -> beamform (multi→mono) -> micGain -> ...
    mic.connect(beamform);
    beamform.connect(micGain);
    micGain.connect(inMeter);
    micGain.connect(model);
    model.connect(wet).connect(mixSum);
    micGain.connect(dryDelay).connect(dry).connect(mixSum);
    mixSum.connect(clarity).connect(boost).connect(limiter).connect(outMeter).connect(ctx.destination);
    limiter.connect(analyser);

    this.micGainNode = micGain;
    this.wetGain = wet; this.dryGain = dry; this.dryDelay = dryDelay; this.mixSum = mixSum;
    this.clarity = clarity; this.boost = boost; this.limiter = limiter;
    this.inMeter = inMeter; this.outMeter = outMeter; this.model = model;

    if (opts.outId && 'setSinkId' in (ctx as any)) {
      try { await (ctx as any).setSinkId(opts.outId); } catch { /* ignore */ }
    }
    try { this.wakeLock = await (navigator as any).wakeLock?.request('screen'); } catch {}
    document.addEventListener('visibilitychange', this.reacquireWakeLock);

    this.reportDelay();
  }

  private reacquireWakeLock = async () => {
    if (document.visibilityState === 'visible' && this.ctx) {
      try { this.wakeLock = await (navigator as any).wakeLock?.request('screen'); } catch {}
    }
  };

  private reportDelay() {
    const ctx = this.ctx; if (!ctx) return;
    const modelLat: Record<ModelId, number> = {
      off: 0, gate: 3, speex: 15, rnnoise: 10, gtcrn: 16,
    };
    const d = ((ctx.baseLatency ?? 0) + ((ctx as any).outputLatency ?? 0)) * 1000 + modelLat[this.modelId];
    this.onDelayMs?.(d);
  }

  private sendClarityParams(node: AudioWorkletNode, p: EngineParams) {
    node.port.postMessage({
      clarity: p.clarity, highs: p.highs, warmth: p.warmth,
      presence: p.presence, air: p.air, deess: p.deess,
      gate: p.gate, makeup: p.makeup, balance: p.balance, profile: p.profile,
    });
  }

  private emit() { this.onMeters?.(this.meters); }

  update(patch: Partial<EngineParams>) {
    if (!this.ctx) { Object.assign(this.currentParams, patch); return; }
    const t = this.ctx.currentTime;
    Object.assign(this.currentParams, patch);
    if (patch.micGain !== undefined && this.micGainNode) this.micGainNode.gain.setTargetAtTime(dB(patch.micGain), t, 0.05);
    if (patch.volume !== undefined && this.boost) this.boost.gain.setTargetAtTime(dB(patch.volume), t, 0.05);
    if (patch.wetDry !== undefined && this.wetGain && this.dryGain) {
      this.wetGain.gain.setTargetAtTime(patch.wetDry, t, 0.03);
      this.dryGain.gain.setTargetAtTime(1 - patch.wetDry, t, 0.03);
    }
    if (this.clarity && (
      patch.clarity !== undefined || patch.highs !== undefined || patch.gate !== undefined ||
      patch.makeup !== undefined || patch.balance !== undefined || patch.profile !== undefined ||
      patch.warmth !== undefined || patch.presence !== undefined || patch.air !== undefined ||
      patch.deess !== undefined
    )) {
      this.clarity.port.postMessage(patch);
    }
    if (this.beamform && (patch.beamform !== undefined || patch.beamAngle !== undefined || patch.arraySpacingCm !== undefined)) {
      this.beamform.port.postMessage({
        spacingCm: this.currentParams.arraySpacingCm ?? 1.5,
        angleDeg: this.currentParams.beamAngle ?? 0,
        enabled: (this.currentParams.beamform ?? true) && this.micChannels >= 2,
      });
      this.onArrayInfo?.({
        channels: this.micChannels,
        beamforming: (this.currentParams.beamform ?? true) && this.micChannels >= 2,
      });
    }
    if (patch.model !== undefined && patch.model !== this.modelId) {
      void this.switchModel(patch.model);
    }
  }

  private async switchModel(id: ModelId) {
    const ctx = this.ctx; if (!ctx || !this.wetGain || !this.mixSum || !this.micGainNode) return;
    const newNode = await makeModelNode(ctx, id);
    const oldWet = this.wetGain;
    // Build a fresh wet path in parallel, crossfade over 50ms.
    const newWet = ctx.createGain();
    newWet.gain.value = 0;
    this.micGainNode.connect(newNode);
    newNode.connect(newWet).connect(this.mixSum);
    const t = ctx.currentTime;
    oldWet.gain.setTargetAtTime(0, t, 0.02);
    newWet.gain.setTargetAtTime(this.currentParams.wetDry, t, 0.02);
    setTimeout(() => {
      try {
        this.model?.disconnect();
        oldWet.disconnect();
      } catch {}
      this.model = newNode;
      this.wetGain = newWet;
      this.modelId = id;
      this.reportDelay();
    }, 80);
  }

  async stop() {
    document.removeEventListener('visibilitychange', this.reacquireWakeLock);
    try { this.wakeLock?.release?.(); } catch {}
    this.wakeLock = null;
    try { this.ctx?.close(); } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx = null;
    this.model = null; this.clarity = null; this.boost = null;
    this.limiter = null; this.inMeter = null; this.outMeter = null;
    this.micGainNode = null; this.wetGain = null; this.dryGain = null;
    this.dryDelay = null; this.mixSum = null; this.analyser = null;
    this.beamform = null; this.micChannels = 1;
  }
}
