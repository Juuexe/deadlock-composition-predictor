import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseResearchRows } from './research.ts';

export type Partition = 'train' | 'validation' | 'calibration' | 'test';
export type ResearchPlan = {
  id: string; directory: string; currentPeriod: string;
  partitions: Record<Partition, { path: string; count: number; sha256: string; first: string; last: string }>;
};

export function parsePlan(value: unknown): ResearchPlan {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string'
    || !/^[a-f0-9-]{36}$/.test(value.id) || !('directory' in value) || value.directory !== `data/research/${value.id}`
    || !('currentPeriod' in value) || typeof value.currentPeriod !== 'string' || !Number.isFinite(Date.parse(value.currentPeriod))
    || !('partitions' in value) || !value.partitions || typeof value.partitions !== 'object') throw new Error('Invalid research plan.');
  const entries = new Map(Object.entries(value.partitions));
  for (const name of ['train', 'validation', 'calibration', 'test']) {
    const part = entries.get(name);
    if (!part || typeof part !== 'object' || part.path !== `${value.directory}/${name}.json`
      || !Number.isSafeInteger(part.count) || part.count <= 0 || typeof part.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(part.sha256) || typeof part.first !== 'string' || typeof part.last !== 'string'
      || !Number.isFinite(Date.parse(part.first)) || !Number.isFinite(Date.parse(part.last)) || part.first > part.last) throw new Error('Invalid research partition.');
  }
  return value as ResearchPlan;
}

export async function loadPlan() { return parsePlan(JSON.parse(await readFile('data/research-current.json', 'utf8'))); }

export async function loadPartition(plan: ResearchPlan, name: Partition) {
  parsePlan(plan);
  const part = plan.partitions[name];
  const text = await readFile(part.path, 'utf8');
  if (createHash('sha256').update(text).digest('hex') !== part.sha256) throw new Error('Frozen partition changed; do not reuse this experiment.');
  const rows = parseResearchRows(JSON.parse(text));
  if (rows.length !== part.count) throw new Error('Partition count changed.');
  return rows.map(row => row.match);
}

export async function claimTest(plan: ResearchPlan, candidateSha256: string) {
  parsePlan(plan);
  if (!/^[a-f0-9]{64}$/.test(candidateSha256)) throw new Error('Invalid candidate hash.');
  try {
    await writeFile(`${plan.directory}/test-opened.json`, JSON.stringify({ candidateSha256, openedAt: new Date().toISOString() }) + '\n', { flag: 'wx' });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new Error('Final test already opened. Prepare a new experiment; do not retune against these results.');
    throw error;
  }
}
