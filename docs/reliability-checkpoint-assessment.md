# Composition predictor: 72-hour checkpoint

The exact first 72 sampling hours contain 139,391 supported matches. The frozen predictor picked 60.45% of winners, with log loss 0.65969 and Brier score 0.23378 (50/50 gives approximately 0.69315 and 0.25). This supports a useful experimental composition signal in the sampled roster period.

Earlier monitoring reports summarized Team A calibration. The more directly relevant product question is whether the team favored by composition wins at the predicted rate, regardless of side. Pooling favored teams and using five-percentage-point bins gives:

| Favored probability range | Matches | Mean prediction | Actual wins |
|---|---:|---:|---:|
| 50–55% | 36,792 | 52.48% | 52.33% |
| 55–60% | 33,550 | 57.45% | 57.23% |
| 60–65% | 27,994 | 62.40% | 61.27% |
| 65–70% | 20,584 | 67.35% | 66.12% |
| 70–75% | 12,670 | 72.25% | 71.14% |
| 75–80% | 6,024 | 77.06% | 75.66% |

The 55–60% range is close to its observed frequency in this sample: the approximate observed-rate 95% interval is 56.70–57.76%. This does not validate precisely 58% or individual compositions. The clearer aggregate confidence problem is in the 60–80% ranges, which overpredict wins by roughly 1.1–1.4 percentage points. A blanket reduction in all confidence could worsen the already-close lower ranges.

Next development should first evaluate a separately trained and calibrated candidate on newly reserved matches, with explicit attention to the 60–80% ranges and daily variation. Do not fit a correction to this reliability dataset: its labels remain evaluation-only. A more complex model is not justified by these diagnostics alone. The deployed model and frozen reliability snapshot remain unchanged.

This is an exploratory diagnosis of already reported evaluation outcomes, not a new independent test or statistical proof. Twelve hourly windows reached the API cap. Intervals assume independent matches and do not represent sampling bias or patch uncertainty. Higher-confidence extremes have little evidence. See reliability-checkpoint.json for the cutoff, input hash, daily metrics and full uncertainty ranges. A reproducible local analysis script is saved under ignored work/checkpoint-analysis.ts.
