export const HEARING_FREQS = [250, 500, 1000, 2000, 4000, 6000];

export function halfGain(threshold: number, reference: number): number {
  return Math.min(25, Math.max(0, 0.5 * (threshold - reference)));
}

export interface FitResult {
  left: number[];
  right: number[];
  mono: number[];
  /** Recommended engine-param overrides derived from the audiogram tilt. */
  recommend: {
    clarity: number;   // 2.5 kHz peak dB
    highs: number;     // 3.5 kHz shelf dB
    presence: number;
    air: number;
    warmth: number;
    deess: number;
  };
  /** Severity summary for the UI: 'mild' | 'moderate' | 'significant'. */
  severity: 'none' | 'mild' | 'moderate' | 'significant';
  /** Difference between ears at high frequencies (dB). */
  asymmetryDb: number;
}

export function fitFromThresholds(
  thresholdsLeft: number[],
  thresholdsRight: number[],
): FitResult {
  const both = [...thresholdsLeft, ...thresholdsRight];
  const midBands = HEARING_FREQS.map((f, i) => (f === 500 || f === 1000) ? i : -1).filter((i) => i >= 0);
  const midValues = midBands.flatMap((i) => [thresholdsLeft[i], thresholdsRight[i]]).filter(Number.isFinite);
  const reference = midValues.length ? Math.min(...midValues) : Math.min(...both);
  const left = thresholdsLeft.map((t) => halfGain(t, reference));
  const right = thresholdsRight.map((t) => halfGain(t, reference));
  const mono = left.map((v, i) => (v + right[i]) / 2);

  // Derived recommendations from mono gains.
  // Index map: [250, 500, 1k, 2k, 4k, 6k]
  const g250 = mono[0], g1k = mono[2], g2k = mono[3], g4k = mono[4], g6k = mono[5];
  const highAvg = (g2k + g4k + g6k) / 3;
  const lowAvg = (g250 + g1k) / 2;
  const tilt = highAvg - lowAvg; // + = high-frequency loss (most common)

  const recommend = {
    clarity:  Math.min(15, Math.max(0, 4 + tilt * 0.5 + g2k * 0.4)),
    highs:    Math.min(15, Math.max(0, 2 + Math.max(0, tilt) * 0.6 + g4k * 0.3)),
    presence: Math.min(10, Math.max(0, 2 + g2k * 0.25)),
    air:      Math.min(10, Math.max(0, 1 + g6k * 0.25)),
    warmth:   Math.min(10, Math.max(-6, 1 + (lowAvg - highAvg) * 0.15)),
    // More sibilance suppression when we're boosting the top end aggressively
    deess:    Math.min(1,   Math.max(0.2, 0.3 + g6k * 0.02)),
  };

  const worstBand = Math.max(...mono);
  const severity: FitResult['severity'] =
    worstBand < 3 ? 'none' :
    worstBand < 10 ? 'mild' :
    worstBand < 20 ? 'moderate' : 'significant';

  const asymmetryDb = Math.max(
    Math.abs(left[3] - right[3]),
    Math.abs(left[4] - right[4]),
    Math.abs(left[5] - right[5]),
  );

  return { left, right, mono, recommend, severity, asymmetryDb };
}
