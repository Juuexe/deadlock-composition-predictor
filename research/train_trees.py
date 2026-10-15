"""Train a fixed grid using composition features only; export JSON, never pickle."""
import json
import sys
from pathlib import Path

import numpy as np
import sklearn
from sklearn.ensemble import GradientBoostingClassifier


def features(rows, heroes):
    return np.array([[int(hero in row['teamA']) - int(hero in row['teamB']) for hero in heroes] for row in rows], dtype=np.float32)


def fit_candidates(data):
    heroes = sorted({hero for row in data['train'] for hero in row['teamA'] + row['teamB']})
    x = features(data['train'], heroes)
    y = np.array([int(row['winner'] == 'A') for row in data['train']])
    x = np.concatenate([x, -x])
    y = np.concatenate([y, 1 - y])
    validation = features(data['validation'], heroes)
    results = []
    for depth in [2, 3]:
        for rounds in [100, 300]:
            estimator = GradientBoostingClassifier(n_estimators=rounds, learning_rate=0.05,
                max_depth=depth, min_samples_leaf=100, random_state=42)
            estimator.fit(x, y)
            logits = (estimator.decision_function(validation) - estimator.decision_function(-validation)) / 2
            trees = []
            for stage in estimator.estimators_:
                tree = stage[0].tree_
                trees.append([{'feature': int(tree.feature[i]), 'threshold': float(tree.threshold[i]),
                    'left': int(tree.children_left[i]), 'right': int(tree.children_right[i]),
                    'value': float(tree.value[i, 0, 0])} for i in range(tree.node_count)])
            results.append({'depth': depth, 'rounds': rounds, 'model': {
                'kind': 'composition-boosted-trees-v1', 'heroes': heroes, 'learningRate': 0.05, 'trees': trees},
                'validationProbabilities': (1 / (1 + np.exp(-logits))).tolist()})
    return {'sklearnVersion': sklearn.__version__, 'candidates': results}


if __name__ == '__main__':
    data = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    # The Node entry point validates and whitelists inputs before this process.
    result = fit_candidates(data)
    with Path(sys.argv[2]).open('x', encoding='utf-8') as destination:
        json.dump(result, destination, allow_nan=False)
