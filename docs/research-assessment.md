# Frozen composition research: first run

Collected 73593 valid matches in 34 one-hour sampling windows across four official Steam announcement periods. Older periods are separate historical datasets; they are not pooled into the current model.

| Announcement period | Matches |
| --- | ---: |
| Rat King release, October 2 | 28299 |
| Minor balance update, October 5 | 8522 |
| Baba release, October 6 | 25292 |
| Solomon release, October 9 | 11480 |

These are announcement-time proxies, not verified match patch IDs. Windows avoid one hour around boundaries and can be capped by API availability. Announcement identification is conservative but not a complete patch feed; exact patch coverage remains unresolved.

The current-period time splits retained 5474 training, 957 validation, 392 calibration and 720 final-test matches. Purged 3659 records whose matches had not finished before the next temporal boundary. Final-test matches start after previously imported datasets and the first research plan's test window. The first plan was replaced before model selection because its proposed test overlapped earlier experiments.

Model and regularization selection used validation only. Temperature calibration used its own sample and retained temperature 1. The final test remained unopened until the candidate, incumbent, scoring code and candidate-selection settings were frozen. It is now spent and cannot be reused for tuning or another final evaluation.

| Final test on identical 720 supported matches | Candidate | Frozen incumbent |
| --- | ---: | ---: |
| Winner accuracy | 60.97% | 61.53% |
| Log loss | 0.64924 | 0.64915 |
| Brier score | 0.22911 | 0.22903 |
| Coverage | 100% | 100% |

The candidate was not promoted. The existing local predictor remains active. Pair terms again did not justify promotion on validation; adding a dedicated calibration stage did not justify changing the probability scale in this run.

This process is a stronger basis for future comparisons, not an accuracy improvement. Current-roster evidence spans hours because Solomon was just released. Old-period data can support retrospective tests, but cannot prove how the current roster will behave across future days. The next experiment needs more current-period history and a new later test window, with the protocol fixed before those results are examined.

See research-plan.json for source announcement URLs, sampling caps, freshness rules and partition hashes; research-evaluation.json records model-selection, calibration and final metrics. Dataset contents and weights remain local, and include no player identifiers or personal statistics.
