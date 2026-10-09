import type { Composition } from './composition.ts';
import type { TrainingMatch } from './data.ts';

export type HeroModel = {
  kind: 'hero-logistic-v1';
  weights: Record<string, number>;
  counts: Record<string, number>;
  regularization: number;
};

export function parseModel(value: unknown): HeroModel {
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'hero-logistic-v1'
    || !('regularization' in value) || typeof value.regularization !== 'number' || !Number.isFinite(value.regularization) || value.regularization <= 0
    || !('weights' in value) || !value.weights || typeof value.weights !== 'object' || Array.isArray(value.weights)
    || !('counts' in value) || !value.counts || typeof value.counts !== 'object' || Array.isArray(value.counts)) throw new Error('Invalid model file.');
  const weights = Object.entries(value.weights);
  const counts = Object.entries(value.counts);
  if (!weights.length || weights.length !== counts.length || weights.some(([key, weight]) =>
    !/^[1-9]\d*$/.test(key) || !Number.isSafeInteger(Number(key)) || typeof weight !== 'number' || !Number.isFinite(weight)
    || !counts.some(([hero, count]) => hero === key && Number.isSafeInteger(count) && count > 0))) throw new Error('Invalid hero weights or support counts.');
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

const sigmoid = (score: number) => 1 / (1 + Math.exp(-score));

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
  return sigmoid(score);
}

export function trainModel(rows: TrainingMatch[], regularization: number): HeroModel {
  parseMatches(rows);
  if (!Number.isFinite(regularization) || regularization <= 0) throw new Error('Regularization must be positive.');
  const heroes = [...new Set(rows.flatMap(row => [...row.teamA, ...row.teamB]))].sort((a, b) => a - b);
  const index = new Map(heroes.map((hero, i) => [hero, i]));
  const weights = new Float64Array(heroes.length);
  const counts = new Float64Array(heroes.length);
  const examples = rows.map(row => ({
    a: row.teamA.map(id => index.get(id)!), b: row.teamB.map(id => index.get(id)!), y: row.winner === 'A' ? 1 : 0,
  }));
  for (const example of examples) for (const i of [...example.a, ...example.b]) counts[i]++;
  // No intercept: swapping the two compositions must complement the probability.
  for (let epoch = 0; epoch < 300; epoch++) {
    const gradient = new Float64Array(heroes.length);
    for (const example of examples) {
      let score = 0;
      for (const i of example.a) score += weights[i];
      for (const i of example.b) score -= weights[i];
      const error = sigmoid(score) - example.y;
      for (const i of example.a) gradient[i] += error;
      for (const i of example.b) gradient[i] -= error;
    }
    for (let i = 0; i < weights.length; i++) weights[i] -= 0.5 * (gradient[i] / rows.length + regularization * weights[i]);
  }
  return {
    kind: 'hero-logistic-v1', regularization,
    weights: Object.fromEntries(heroes.map((hero, i) => [hero, weights[i]])),
    counts: Object.fromEntries(heroes.map((hero, i) => [hero, counts[i]])),
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
