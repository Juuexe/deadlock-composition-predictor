import type { Composition } from './composition.ts';
import type { TrainingMatch } from './data.ts';

export type HeroModel = {
  kind: 'hero-logistic-v1' | 'hero-pairs-logistic-v1';
  weights: Record<string, number>;
  counts: Record<string, number>;
  regularization: number;
  pairs?: Record<string, number>;
  pairCounts?: Record<string, number>;
};

export function parseModel(value: unknown): HeroModel {
  if (!value || typeof value !== 'object' || !('kind' in value) || (value.kind !== 'hero-logistic-v1' && value.kind !== 'hero-pairs-logistic-v1')
    || !('regularization' in value) || typeof value.regularization !== 'number' || !Number.isFinite(value.regularization) || value.regularization <= 0
    || !('weights' in value) || !value.weights || typeof value.weights !== 'object' || Array.isArray(value.weights)
    || !('counts' in value) || !value.counts || typeof value.counts !== 'object' || Array.isArray(value.counts)) throw new Error('Invalid model file.');
  const weights = Object.entries(value.weights);
  const counts = Object.entries(value.counts);
  if (!weights.length || weights.length !== counts.length || weights.some(([key, weight]) =>
    !/^[1-9]\d*$/.test(key) || !Number.isSafeInteger(Number(key)) || typeof weight !== 'number' || !Number.isFinite(weight)
    || !counts.some(([hero, count]) => hero === key && Number.isSafeInteger(count) && count > 0))) throw new Error('Invalid hero weights or support counts.');
  if (value.kind === 'hero-pairs-logistic-v1') {
    if (!('pairs' in value) || !value.pairs || typeof value.pairs !== 'object' || Array.isArray(value.pairs)
      || !('pairCounts' in value) || !value.pairCounts || typeof value.pairCounts !== 'object' || Array.isArray(value.pairCounts)) throw new Error('Missing pair model fields.');
    const counts = new Map(Object.entries(value.pairCounts));
    const pairs = Object.entries(value.pairs);
    if (pairs.length !== counts.size || pairs.some(([key, weight]) => {
      const match = /^[sc]:([1-9]\d*):([1-9]\d*)$/.exec(key);
      const count = counts.get(key);
      return !match || Number(match[1]) >= Number(match[2]) || !Object.hasOwn(value.weights!, match[1]) || !Object.hasOwn(value.weights!, match[2])
        || typeof weight !== 'number' || !Number.isFinite(weight) || !Number.isSafeInteger(count) || Number(count) < 20;
    })) throw new Error('Invalid pair weights or support counts.');
  } else if ('pairs' in value || 'pairCounts' in value) throw new Error('Hero-only models cannot contain pair terms.');
  return value as HeroModel;
}

export function validateComposition(value: unknown): asserts value is Composition {
  if (!value || typeof value !== 'object' || !('teamA' in value) || !('teamB' in value)
    || !Array.isArray(value.teamA) || !Array.isArray(value.teamB)
    || value.teamA.length !== 6 || value.teamB.length !== 6) throw new Error('Select six heroes on each team.');
  const heroes = [...value.teamA, ...value.teamB];
  if (heroes.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(heroes).size !== 12) throw new Error('Hero IDs must be positive integers and unique across both teams.');
}

export function parseMatches(value: unknown): TrainingMatch[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Empty or invalid training dataset.');
  for (const row of value) {
    validateComposition(row);
    if (!('matchId' in row) || !Number.isSafeInteger(row.matchId) || Number(row.matchId) <= 0
      || !('winner' in row) || (row.winner !== 'A' && row.winner !== 'B')
      || !('startedAt' in row) || typeof row.startedAt !== 'string'
      || !Number.isFinite(Date.parse(row.startedAt)) || new Date(row.startedAt).toISOString() !== row.startedAt
      || Object.keys(row).sort().join(',') !== 'matchId,startedAt,teamA,teamB,winner') throw new Error('Invalid saved match fields.');
  }
  return value as TrainingMatch[];
}

export function chronologicalSplit(rows: TrainingMatch[]) {
  parseMatches(rows);
  const sorted = [...rows].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.matchId - b.matchId);
  if (new Set(sorted.map(row => row.matchId)).size !== rows.length) throw new Error('Duplicate match IDs.');
  let first = Math.floor(rows.length * 0.7);
  let second = Math.floor(rows.length * 0.85);
  while (first > 0 && sorted[first]?.startedAt === sorted[first - 1]?.startedAt) first--;
  while (second > first && sorted[second]?.startedAt === sorted[second - 1]?.startedAt) second--;
  const split = { train: sorted.slice(0, first), validation: sorted.slice(first, second), test: sorted.slice(second) };
  if (Object.values(split).some(part => !part.length)) throw new Error('Need distinct timestamps for three nonempty chronological splits.');
  return split;
}

export function rosterCohort(rows: TrainingMatch[]) {
  parseMatches(rows);
  const firstSeen = new Map<number, string>();
  for (const row of rows) for (const hero of [...row.teamA, ...row.teamB]) {
    const previous = firstSeen.get(hero);
    if (!previous || row.startedAt < previous) firstSeen.set(hero, row.startedAt);
  }
  const since = [...firstSeen.values()].sort().at(-1)!;
  return { since, rows: rows.filter(row => row.startedAt >= since) };
}

export function laterMatches(rows: TrainingMatch[], frozenAt: string): TrainingMatch[] {
  parseMatches(rows);
  if (!Number.isFinite(Date.parse(frozenAt))) throw new Error('Invalid model freeze time.');
  if (new Set(rows.map(row => row.matchId)).size !== rows.length) throw new Error('Duplicate match IDs.');
  const cutoff = new Date(frozenAt).toISOString();
  return rows.filter(row => row.startedAt > cutoff);
}

const sigmoid = (score: number) => 1 / (1 + Math.exp(-score));

export function pairTerms(composition: Composition): [string, number][] {
  const a = [...composition.teamA].sort((x, y) => x - y);
  const b = [...composition.teamB].sort((x, y) => x - y);
  const terms: [string, number][] = [];
  for (const [team, sign] of [[a, 1], [b, -1]] as const) {
    for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) terms.push([`s:${team[i]}:${team[j]}`, sign]);
  }
  for (const own of a) for (const enemy of b) terms.push([`c:${Math.min(own, enemy)}:${Math.max(own, enemy)}`, own < enemy ? 1 : -1]);
  return terms.sort(([x], [y]) => x.localeCompare(y));
}

export function predict(model: HeroModel, composition: Composition): number {
  validateComposition(composition);
  let score = 0;
  for (const [team, sign] of [[composition.teamA, 1], [composition.teamB, -1]] as const) {
    for (const hero of [...team].sort((a, b) => a - b)) {
      const weight = model.weights[hero];
      if (!Number.isFinite(weight)) throw new Error(`Hero ${hero} is not supported by this model.`);
      score += sign * weight;
    }
  }
  if (model.kind === 'hero-pairs-logistic-v1') for (const [key, sign] of pairTerms(composition)) score += sign * (model.pairs?.[key] ?? 0);
  return sigmoid(score);
}

export function trainModel(rows: TrainingMatch[], regularization: number, interactions = false): HeroModel {
  parseMatches(rows);
  if (!Number.isFinite(regularization) || regularization <= 0) throw new Error('Regularization must be positive.');
  const heroes = [...new Set(rows.flatMap(row => [...row.teamA, ...row.teamB]))].sort((a, b) => a - b);
  const terms = rows.map(row => [
    ...row.teamA.map(hero => [String(hero), 1] as [string, number]),
    ...row.teamB.map(hero => [String(hero), -1] as [string, number]),
    ...(interactions ? pairTerms(row) : []),
  ]);
  const counts = new Map<string, number>();
  for (const example of terms) for (const [key] of example) counts.set(key, (counts.get(key) ?? 0) + 1);
  // shortcut: fewer than 20 observations leaves a pair neutral; revisit with broader history and validation.
  const pairKeys = [...counts.keys()].filter(key => key.includes(':') && counts.get(key)! >= 20).sort();
  const keys = [...heroes.map(String), ...pairKeys];
  const index = new Map(keys.map((key, i) => [key, i]));
  const weights = new Float64Array(keys.length);
  const examples = terms.map((terms, i) => ({
    terms: terms.filter(([key]) => index.has(key)).map(([key, sign]) => [index.get(key)!, sign] as const),
    y: rows[i].winner === 'A' ? 1 : 0,
  }));
  // No intercept: swapping the two compositions must complement the probability.
  for (let epoch = 0; epoch < (interactions ? 1000 : 300); epoch++) {
    const gradient = new Float64Array(keys.length);
    for (const example of examples) {
      let score = 0;
      for (const [i, sign] of example.terms) score += sign * weights[i];
      const error = sigmoid(score) - example.y;
      for (const [i, sign] of example.terms) gradient[i] += sign * error;
    }
    for (let i = 0; i < weights.length; i++) weights[i] -= (interactions ? 0.05 : 0.5) * (gradient[i] / rows.length + regularization * weights[i]);
  }
  return {
    kind: interactions ? 'hero-pairs-logistic-v1' : 'hero-logistic-v1', regularization,
    weights: Object.fromEntries(heroes.map((hero, i) => [hero, weights[i]])),
    counts: Object.fromEntries(heroes.map(hero => [hero, counts.get(String(hero))!])),
    ...(interactions ? {
      pairs: Object.fromEntries(pairKeys.map(key => [key, weights[index.get(key)!]])),
      pairCounts: Object.fromEntries(pairKeys.map(key => [key, counts.get(key)!])),
    } : {}),
  };
}

export function evaluate(rows: TrainingMatch[], probability: (row: TrainingMatch) => number) {
  if (!rows.length) throw new Error('No matches to evaluate.');
  let logLoss = 0, brierScore = 0, correct = 0;
  const bins = Array.from({ length: 10 }, (_, index) => ({ lower: index / 10, upper: (index + 1) / 10, count: 0, predicted: 0, observed: 0 }));
  for (const row of rows) {
    const p = probability(row);
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Invalid probability.');
    const y = row.winner === 'A' ? 1 : 0;
    const bounded = Math.max(1e-15, Math.min(1 - 1e-15, p));
    logLoss -= y * Math.log(bounded) + (1 - y) * Math.log(1 - bounded);
    brierScore += (p - y) ** 2;
    correct += p === 0.5 ? 0.5 : Number((p > 0.5) === Boolean(y));
    const bin = bins[Math.min(9, Math.floor(p * 10))];
    bin.count++; bin.predicted += p; bin.observed += y;
  }
  return {
    count: rows.length, logLoss: logLoss / rows.length, brierScore: brierScore / rows.length, accuracy: correct / rows.length,
    calibration: bins.filter(bin => bin.count).map(bin => ({
      lower: bin.lower, upper: bin.upper, count: bin.count,
      predicted: bin.predicted / bin.count, observed: bin.observed / bin.count,
    })),
  };
}
