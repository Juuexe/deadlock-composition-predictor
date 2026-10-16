# Deadman Danny roster update

Candidate version 5c094e85ad12 supports all 42 active catalog heroes, including Deadman Danny (78). The hero-only model selected regularization 0.001 and temperature 1. Pair candidates did not win selection. The prediction formula and source src/model.ts are unchanged.

The newest official gameplay period begins 2026-10-15 03:11:58 UTC (Minor Update - 10-14-2026). Sampling produced 49,706 completed, valid matches in this period. Completion-time purging removed 4,212 boundary-crossing matches. The remaining split is 21,116 training / 10,163 validation / 7,495 calibration / 6,720 final test. Danny appears in 17,980 training, 8,460 validation and 6,194 calibration matches. All 165,377 reserved old reliability match IDs were excluded from development; older periods remain separate.

The roster-expansion policy was written and committed before final-test access. Candidate, partition, policy and scoring hashes were frozen locally. The shared one-use marker was claimed before opening test labels. These final-test labels are now spent. No post-test tuning was performed. See roster-protocol.md for the explicit coverage-expansion gate; the existing same-roster gate remains unchanged.

| Held-out cohort | Matches | Candidate accuracy | Candidate log loss | Candidate Brier | Incumbent log loss | Incumbent Brier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| All | 6,720 | 60.95% | 0.65624 | 0.23222 | Abstains on Danny games | Abstains on Danny games |
| Shared supported heroes | 1,043 | 58.01% | 0.66789 | 0.23775 | 0.67300 | 0.24004 |
| Danny present | 5,677 | 61.49% | 0.65410 | 0.23120 | Unsupported | Unsupported |

Candidate coverage is 100% for each cohort. The old model picked 58.58% of winners in the shared cohort, slightly above the candidate's 58.01%, but its probability losses were worse. The new-hero cohort beats the 50/50 log loss 0.69315 and Brier 0.25. Every frozen release-review condition passed. Overall accuracy's descriptive Wilson 95% interval is about 59.78%–62.11%; it does not account for availability sampling, correlated matches or future updates.

This is a roughly 3.5-hour chronological test window, not established prospective multi-day reliability. The available API caps many hourly samples at 2,500 matches. The new hero appears in most games in this sample, so common-hero comparisons use a smaller cohort. No causal hero-strength conclusion or exact probability calibration is established. New prospective monitoring must use its own immutable experiment; the old frozen snapshot is retained and never reset.

Aggregate results: roster-evaluation.json. Public model-linked holdout evidence: roster-release.json. Datasets, candidates, protocol snapshots, test markers and weights remain local and ignored. The pre-update model 3debc4970fe5 is archived for rollback.

The reviewed update is merged into main and deployed at https://deadlock-composition-predictor.vercel.app. Public health reports 5c094e85ad12; all 42 heroes are available, Danny lineups predict, draft suggestions work and the evidence endpoint returns this holdout separately from the old reliability snapshot. TypeScript checks, 35 tests and browser/API smoke checks passed.
