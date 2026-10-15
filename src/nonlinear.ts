import { validateComposition } from './model.ts';
import type { Composition } from './composition.ts';

type Node = { feature: number; threshold: number; left: number; right: number; value: number };
export type TreeModel = { kind: 'composition-boosted-trees-v1'; heroes: number[]; learningRate: number; trees: Node[][]; temperature?: number };

export function parseTreeModel(value: unknown): TreeModel {
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'composition-boosted-trees-v1'
    || !('heroes' in value) || !Array.isArray(value.heroes) || value.heroes.length < 12
    || value.heroes.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(value.heroes).size !== value.heroes.length
    || !('learningRate' in value) || typeof value.learningRate !== 'number' || !Number.isFinite(value.learningRate) || value.learningRate <= 0
    || !('trees' in value) || !Array.isArray(value.trees) || !value.trees.length || value.trees.length > 1000
    || ('temperature' in value && (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature) || value.temperature <= 0))) throw new Error('Invalid tree model.');
  for (const tree of value.trees) {
    if (!Array.isArray(tree) || !tree.length || tree.length > 1023) throw new Error('Invalid tree nodes.');
    for (const [i, node] of tree.entries()) {
      if (!node || typeof node !== 'object' || !Number.isFinite(node.value) || !Number.isFinite(node.threshold)
        || !Number.isSafeInteger(node.feature) || !Number.isSafeInteger(node.left) || !Number.isSafeInteger(node.right)
        || (node.left === -1 ? node.right !== -1 || node.feature !== -2
          : node.feature < 0 || node.feature >= value.heroes.length || node.left <= i || node.right <= i || node.left >= tree.length || node.right >= tree.length)) throw new Error('Invalid tree branch.');
    }
  }
  return value as TreeModel;
}

export function predictTree(model: TreeModel, composition: Composition): number {
  validateComposition(composition);
  const a = new Set(composition.teamA), b = new Set(composition.teamB);
  if ([...a, ...b].some(hero => !model.heroes.includes(hero))) throw new Error('Composition contains unsupported heroes.');
  const features = model.heroes.map(hero => Number(a.has(hero)) - Number(b.has(hero)));
  const raw = (sign: number) => {
    let score = 0;
    for (const tree of model.trees) {
      let index = 0;
      while (tree[index].left !== -1) {
        const node = tree[index];
        index = sign * features[node.feature] <= node.threshold ? node.left : node.right;
      }
      score += tree[index].value;
    }
    return score * model.learningRate;
  };
  // Antisymmetrizing logits cancels the intercept and guarantees complementary team swaps.
  return 1 / (1 + Math.exp(-(raw(1) - raw(-1)) / (2 * (model.temperature ?? 1))));
}
