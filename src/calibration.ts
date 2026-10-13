export type CalibrationCurve = { slope: number; compression: number };
export function adjustProbability(p: number, curve: CalibrationCurve): number {
  if (!Number.isFinite(p) || p < 0 || p > 1 || !Number.isFinite(curve.slope) || curve.slope <= 0
    || !Number.isFinite(curve.compression) || curve.compression < 0) throw new Error('Invalid probability or calibration curve.');
  if (p === 0.5) return p;
  const bounded = Math.max(1e-15, Math.min(1 - 1e-15, p));
  const logit = Math.log(bounded / (1 - bounded));
  // Positive slope and nonnegative compression preserve ordering and complementary team swaps.
  return 1 / (1 + Math.exp(-curve.slope * logit / (1 + curve.compression * Math.abs(logit))));
}
