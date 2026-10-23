# October 23 data and roster refresh

Model `8b35c11d0619` supports 44 heroes, adding Violet (86) and Nurse Harrow (87) while retaining all previous heroes. The existing six-candidate validation grid selected `hero-pairs-logistic-v1`, regularization 0.001 and temperature 1. All 1,892 ally/opponent pair coefficients were learned from composition and outcome alone. The scoring implementation in `src/model.ts` is unchanged; player data is excluded.

The official [Nurse Harrow release](https://store.steampowered.com/news/app/1422450/view/669505296465396778) on October 20 at 20:59:53 UTC starts this experiment's period. The announcement parser now recognizes “now joins us” and “joining us today”; a regression test rejects future-tense release previews. Previously the feed parser missed this wording, which could mix roster periods. Existing frozen experiments and weights were preserved.

Collection sampled 83 hourly windows across four announcement periods, retaining 206,634 sanitized matches. Only the newest period's 136,646 matches entered this experiment. Completion-time purging excluded 5,137 split-crossing matches. Training: 67,471; validation: 25,454; calibration: 18,326; final test: 20,258. Development partitions have zero overlap with 172,817 reserved reliability or previously opened final-test match IDs. Violet appears in 40,957 training matches and Nurse Harrow in 59,757.

Validation log loss was 0.66398 for the selected pair model versus 0.66460 for the best hero-only candidate. This is a small validation advantage, not proof that interactions improve future matches. Candidate, scoring hashes, partitions and the existing roster-expansion policy were frozen before opening the final test once. These test labels are now spent; no post-test tuning occurred.

| Held-out cohort | Matches | Accuracy | Log loss | Brier | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| All | 20,258 | 59.91% | 0.66336 | 0.23549 | 100% |
| Previous 42 supported heroes | 2,430 | 59.84% | 0.66252 | 0.23513 | 100% |
| Violet present | 11,206 | 59.66% | 0.66510 | 0.23629 | 100% |
| Nurse Harrow present | 15,873 | 59.89% | 0.66396 | 0.23577 | 100% |

New-hero cohorts overlap when both heroes appear. The incumbent scored 59.59% accuracy, 0.66972 log loss and 0.23841 Brier on the same 2,430 common-hero games. The candidate improves both probability losses there, and beats 50/50 (0.69315 log loss, 0.25 Brier) overall and within each new-hero cohort. Every existing roster-expansion gate passed. Overall descriptive 95% Wilson accuracy interval: 59.23%–60.58%.

The held-out start times run from October 22 20:51:11 UTC through October 23 04:59:44 UTC, roughly eight hours. This is a chronological holdout from already collected matches, not prospective multi-day reliability. Capped hourly API availability samples, correlated matches, unknown exact deployment times and future patches limit conclusions. Ten-point calibration bins include approximate Wilson intervals; sparse extreme bins remain very uncertain. Exact 58% calibration and causal draft quality are not established. Comparing 59.91% here with an older model's 60.95% on different matches would not establish a regression.

The 88,011-byte model exceeds Vercel's 64 KiB combined environment limit uncompressed. Lossless gzip plus base64 reduces it to 43,681 bytes, alongside a 6,456-byte catalog. The hosted adapter retains plain JSON compatibility, limits decompressed output to 1 MiB and validates the decoded model. Tests verify identical scores/version and generic 503 responses for corrupt or oversized compressed payloads. Model values remain encrypted server-only secrets, with datasets and weights ignored locally.

Aggregate evidence is in `roster-evaluation.json` and the hash-matched public manifest in `roster-release.json`. Previous model `5c094e85ad12`, its public evidence and all frozen research artifacts remain archived locally. The older `3debc4970fe5` reliability snapshot is unchanged. Prospective monitoring for this new model has not been started.

The first hosted model upload was truncated at 8,192 bytes on this Windows CLI stdin path, causing configuration 503s on the staged deployments. The stable public alias kept serving the prior working model. Replacing the Secret with the authenticated file-based environment API preserved the complete 43,681-byte value. The staged model hash, 44-hero catalog, holdout evidence, prediction and draft results then passed, including exact local/hosted prediction equality, before promotion. Configuration failure logs now contain only the failing stage, error type, byte count and encoding flag, never values or exception messages. Truncated gzip input has an explicit regression case.

Production deployment dpl_GBbP1sz18bK71CbjJRrFkrq5nqXZ is verified at https://deadlock-composition-predictor.vercel.app. Public API checks pass for 44 heroes, both additions, team swaps/order invariance, five draft suggestions, model-matched holdout evidence, rejected player inputs and private-file rejection. Browser comparison restored the shared lineup, rendered both new portraits and showed the expected 47.4%/52.6% example result with no console errors or warnings. All 36 tests and strict TypeScript checks pass. Existing platform transpilation warnings remain separate from successful repository checks and runtime verification.
