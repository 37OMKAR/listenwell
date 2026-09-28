export const HEARING_FREQS = [250, 500, 1000, 2000, 4000, 6000];

export function halfGain(threshold: number, reference: number): number {
  return Math.min(25, Math.max(0, 0.5 * (threshold - reference)));
}

export function fitFromThresholds(
  thresholdsLeft: number[],
  thresholdsRight: number[],
): { left: number[]; right: number[]; mono: number[] } {
  const both = [...thresholdsLeft, ...thresholdsRight];
  const midBands = HEARING_FREQS.map((f, i) => (f === 500 || f === 1000) ? i : -1).filter((i) => i >= 0);
  const midValues = midBands.flatMap((i) => [thresholdsLeft[i], thresholdsRight[i]]).filter(Number.isFinite);
  const reference = midValues.length ? Math.min(...midValues) : Math.min(...both);
  const left = thresholdsLeft.map((t) => halfGain(t, reference));
  const right = thresholdsRight.map((t) => halfGain(t, reference));
  const mono = left.map((v, i) => (v + right[i]) / 2);
  return { left, right, mono };
}
