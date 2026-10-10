# Experimental baseline assessment

The predictor learns composition associations from real match outcomes, using hero IDs only. It does not establish causal advantage. Training now compares hero-only and pair-feature candidates; the currently selected model remains hero-only because pair features did not improve validation.

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

The saved earlier hero model was tested without refitting on 8167 matches that started strictly after its saved timestamp. Coverage was 100%, winner accuracy 60.1%, log loss 0.6629 and Brier score 0.2352. The 50/50 log loss was 0.6931. This is stronger evidence than the earlier short exploratory holdout, but is still an API-availability sample over a short period, with unverified patches and calibration. Details are in prospective-evaluation.json.

On a newer 9999-match sample, the observed roster cohort retained 9985 matches. The split used 6989 training, 1498 validation and 1498 test matches. Three regularization settings were compared per model family. The best hero-only validation scores were 0.64718 log loss and 0.22786 Brier; the strongest pair candidate scored 0.65139 and 0.22969. Therefore pair terms were not promoted. The retained model's final test accuracy was 62.5%, log loss 0.64797 and Brier 0.22846, with 100% coverage.

These results belong to different models and samples and should not be described as a proven rise from 60.1% to 62.5%. Keep collecting independent later batches and verify patch boundaries before claiming stable accuracy. Pair terms use shared outcome data and may be confounded with hero strength and selection patterns; they are not mechanical counter rules.

Method references: https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html and https://scikit-learn.org/stable/modules/calibration.html. This project implements the small linear baseline directly in TypeScript; it does not depend on scikit-learn.
