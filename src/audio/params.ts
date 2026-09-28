export type ModelId = 'off' | 'gate' | 'speex' | 'rnnoise' | 'gtcrn';

export interface ClarityParams {
  clarity: number;    // 0..15 dB, 2.5kHz peak
  highs: number;      // 0..15 dB, 3.5kHz shelf
  warmth: number;     // -6..+10 dB, 800Hz peak
  presence: number;   // 0..10 dB, extra on top of clarity
  air: number;        // 0..10 dB, 10kHz shelf
  deess: number;      // 0..1, sibilance reduction strength
  gate: number;       // 0..1 strength
  makeup: number;     // 0..30 dB
  balance: number;    // -1..1 (L..R)
  profile: number[];  // 6 bands, dB (250,500,1k,2k,4k,6k), per-mono for now
}

export interface EngineParams extends ClarityParams {
  micGain: number;    // 0..12 dB
  volume: number;     // 0..18 dB
  wetDry: number;     // 0..1 (wet)
  model: ModelId;
}

export const defaultParams: EngineParams = {
  micGain: 6,
  volume: 8,
  wetDry: 0.8,
  model: 'rnnoise',
  clarity: 6,
  highs: 4,
  warmth: 2,
  presence: 3,
  air: 2,
  deess: 0.5,
  gate: 0.3,
  makeup: 6,
  balance: 0,
  profile: [0, 0, 0, 0, 0, 0],
};

export type Preset = { id: string; label: string; params: Partial<EngineParams> };

export const presets: Preset[] = [
  { id: 'conv',   label: '💬 Conversation', params: { model: 'rnnoise', wetDry: 0.8,  clarity: 7, highs: 4, warmth: 2, presence: 3, air: 2, deess: 0.5, makeup: 6,  volume: 8  } },
  { id: 'noisy',  label: '🏙 Noisy place',   params: { model: 'rnnoise', wetDry: 0.95, clarity: 9, highs: 6, warmth: 1, presence: 4, air: 3, deess: 0.7, makeup: 8,  volume: 10 } },
  { id: 'tv',     label: '📺 TV / Lecture',  params: { model: 'rnnoise', wetDry: 0.7,  clarity: 6, highs: 4, warmth: 3, presence: 3, air: 2, deess: 0.4, makeup: 4,  volume: 10 } },
  { id: 'quiet',  label: '🌙 Quiet room',    params: { model: 'off',     wetDry: 0.0,  clarity: 3, highs: 2, warmth: 2, presence: 1, air: 1, deess: 0.3, makeup: 2,  volume: 4  } },
  { id: 'music',  label: '🎵 Music / Voice', params: { model: 'off',     wetDry: 0.0,  clarity: 3, highs: 3, warmth: 3, presence: 2, air: 4, deess: 0.2, makeup: 2,  volume: 6  } },
];
