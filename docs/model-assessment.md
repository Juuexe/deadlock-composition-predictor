# Experimental baseline assessment

The first predictor learns hero-strength associations from real match outcomes, using hero IDs only. It does not establish causal composition advantage and does not yet model synergies or counters.

## Sampling diagnostics

| Sample | Supported test matches | Test coverage | Test accuracy | Test log loss |
| --- | ---: | ---: | ---: | ---: |
| 13997 matches across 14 daily windows | 238 | 11.3% | 58.0% | 0.6825 |
| 10000 recent matches with ordinary time split | 16 | 1.1% | 50.0% | 0.7339 |
| Latest observed roster cohort within that 10000 | 279 | 100% | 60.6% | 0.6508 |

Heroes 85 and 88 appeared after the oldest training period in the first run. Hero 85 appeared too late for training in the second run. Those models correctly abstained, but their tiny supported holdouts cannot stand for the full match population. Diagnostic reports remain in ignored local models/ files.

The roster rule uses compositions and timestamps, not outcomes, to begin at the latest first observation of any hero in the dataset. This retained 1845 matches: 1289 training, 277 validation and 279 test. The observed roster period spans roughly 45 minutes. It is not a confirmed patch boundary.

The third run's test Brier score was 0.2303 (50/50: 0.2500); log loss was 0.6508 (50/50: 0.6931). Both scores measure probability quality; lower is better. Neither alone establishes calibration. See the bin counts and predicted/observed frequencies in baseline-evaluation.json. Bins are small and future-match calibration remains unknown.

This remains exploratory: the cohort rule changed after diagnostic evaluations. Do not describe the 60.6% result as established future accuracy or claim that a displayed 58% will win 58% of future games.

## Next model work

Freeze the current pipeline and evaluate prospectively on later batches before using predictions as reliable advice. Obtain broader data within a verified roster/patch period. Then compare synergy and counter features to this hero-strength baseline using validation data, keeping a new final test untouched.

Method references: https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html and https://scikit-learn.org/stable/modules/calibration.html. This project implements the small linear baseline directly in TypeScript; it does not depend on scikit-learn.
