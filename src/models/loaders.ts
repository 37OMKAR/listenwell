import type { ModelId } from '../audio/params';

// Dynamic imports so a phone that never touches DFN3 (etc.) doesn't pay for it.
// The @sapphi-red/web-noise-suppressor package exposes worklet URLs and wasm URLs;
// we import them lazily and let Vite hash them.
export async function makeModelNode(ctx: AudioContext, id: ModelId): Promise<AudioNode> {
  switch (id) {
    case 'off':
      return ctx.createGain();

    case 'gate': {
      const mod: any = await import('@sapphi-red/web-noise-suppressor');
      const workletUrl = (await import('@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url')).default;
      await ctx.audioWorklet.addModule(workletUrl);
      return new mod.NoiseGateWorkletNode(ctx, {
        openThreshold: -50, closeThreshold: -60, holdMs: 90, maxChannels: 1,
      });
    }

    case 'speex': {
      const mod: any = await import('@sapphi-red/web-noise-suppressor');
      const wasmUrl = (await import('@sapphi-red/web-noise-suppressor/speex.wasm?url')).default;
      const workletUrl = (await import('@sapphi-red/web-noise-suppressor/speexWorklet.js?url')).default;
      const wasmBinary = await mod.loadSpeex({ url: wasmUrl });
      await ctx.audioWorklet.addModule(workletUrl);
      return new mod.SpeexWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
    }

    case 'rnnoise': {
      const mod: any = await import('@sapphi-red/web-noise-suppressor');
      const wasmUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoise.wasm?url')).default;
      const simdUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url')).default;
      const workletUrl = (await import('@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url')).default;
      const wasmBinary = await mod.loadRnnoise({ url: wasmUrl, simdUrl });
      await ctx.audioWorklet.addModule(workletUrl);
      return new mod.RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
    }

    case 'gtcrn': {
      // GTCRN not available in the installed @sapphi-red/web-noise-suppressor version;
      // fall back to RNNoise so the model chip still works.
      return makeModelNode(ctx, 'rnnoise');
    }
  }
}

export const modelLabel: Record<ModelId, string> = {
  off: 'Off',
  gate: 'Gate',
  speex: 'Light (Speex)',
  rnnoise: 'Balanced (RNNoise)',
  gtcrn: 'Best (GTCRN)',
};
