import { evaluate, parseMatches, predict, type HeroModel } from './model.ts';
import type { TrainingMatch } from './data.ts';

export function wilson(wins: number, count: number) {
  if (!count) return null;
  const p = wins / count, z2 = 1.96 ** 2;
  const center = (p + z2 / (2 * count)) / (1 + z2 / count);
  const radius = 1.96 * Math.sqrt(p * (1 - p) / count + z2 / (4 * count ** 2)) / (1 + z2 / count);
  return { lower: Math.max(0, center - radius), upper: Math.min(1, center + radius) };
}

export function reliabilityReport(model: HeroModel, rows: TrainingMatch[]) {
  if (rows.length) parseMatches(rows);
  if (new Set(rows.map(row => row.matchId)).size !== rows.length) throw new Error('Duplicate reliability match IDs.');
  const supported = rows.filter(row => [...row.teamA, ...row.teamB].every(hero => Object.hasOwn(model.weights, hero)));
  const score = (part: TrainingMatch[]) => {
    if (!part.length) return null;
    const result = evaluate(part, row => predict(model, row));
    return { ...result, accuracyInterval95: wilson(result.accuracy * result.count, result.count),
      calibration: result.calibration.map(bin => ({ ...bin, observedInterval95: wilson(bin.observed * bin.count, bin.count) })) };
  };
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
  const days = [...new Set(rows.map(row => date.format(new Date(row.startedAt))))].sort().map(day => {
    const all = rows.filter(row => date.format(new Date(row.startedAt)) === day);
    const accepted = supported.filter(row => date.format(new Date(row.startedAt)) === day);
    return { day, total: all.length, coverage: accepted.length / all.length, score: score(accepted) };
  });
  return { total: rows.length, coverage: rows.length ? supported.length / rows.length : null,
    overall: score(supported), coinFlip: supported.length ? evaluate(supported, () => 0.5) : null, days };
}
