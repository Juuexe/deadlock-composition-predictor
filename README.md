# Deadlock composition predictor

Estimate which hero composition is favored using historical match outcomes. No individual player data enters the predictor.

## Development

Use Node.js 24.19.0 and npm. Git and the Codex editor are sufficient; no paid services or database server are required for setup.

```sh
npm ci
npm run check
```

TypeScript runs through Node's built-in type stripping; tsc performs the separate strict type check. Tests use Node's built-in runner.

## Workflow

Keep main passing. Create a short feature branch, make one complete change, run npm run check, and open a pull request. GitHub Actions repeats the same checks.

## Build order

1. Verify Deadlock API hero catalog, historical match fields, data access and sample coverage.
2. Import only compositions, outcomes, match timestamps and patch context. Discard player identities and performance fields.
3. Train a simple composition baseline, then evaluate on chronologically later matches. Compare log loss, Brier score and calibration against a constant baseline before publishing probabilities.
4. Add manual team selection and explanations for composition advantages.
5. Add draft recommendations using the validated predictor.
6. Investigate automatic composition detection near match start. Live gameplay prediction is a separate later feature.

Potential data source: https://api.deadlock-api.com/docs

## Import a real data sample

```sh
npm run import:data -- 1000
```

The first argument is the per-window limit (1–10000; default 1000). The second is the number of daily windows (1–14; default 1). For example, npm run import:data -- 1000 14 collects at most 14000 matches across two weeks. The importer makes one hero request and one bulk request per window, with a 60-second timeout per request. It ends the sample one hour before import time to favor completed games. HTTP failures stop the import; rerun later after rate limiting. It uses normal ranked/unranked matches, excluding unscored games, incomplete teams, malformed fields and duplicate heroes.

Local ignored outputs: data/heroes.json, data/matches.json and data/import-summary.json. The saved match fields are matchId, startedAt, teamA, teamB and winner. Account IDs, skill badges, items and performance statistics returned by the upstream API are discarded before storage. Unzoned API timestamps are interpreted as UTC. Each file is replaced atomically after validation; the three files are not a single transaction. Run one importer at a time.

The sample is for verifying the pipeline, not for claiming prediction accuracy. It contains recent fetched matches, which may be unrepresentative. Training needs broader history, patch boundaries and chronological evaluation; start-time alone is not a verified patch label. The current hero catalog is stored separately and historical heroes are retained rather than silently removed.

## Train and predict

```sh
npm run import:data -- 10000 1
npm run train
npm run predict -- "4,12,31,58,85,88" "17,52,69,72,76,84"
```

The predictor expects six distinct hero IDs on each team. Find IDs and names in data/heroes.json. Unsupported heroes cause an error rather than an invented neutral contribution. Outputs are experimental probabilities and hero appearance counts in training.

Training uses the period since the latest first observation of any hero in the saved dataset, so newly observed heroes can enter training. This is a roster observation rule, not a verified release or patch date. At least 1000 matches must remain. Split that cohort by time into approximately 70% training, 15% validation and 15% test, without shared match IDs or split-boundary timestamps. Choose regularization on validation only, then report test log loss, Brier score, calibration bins and coverage against both 50/50 and training win-rate constants.

Training compares a hero-only model with a pair-feature model: 15 unordered teammate pairs per side and 36 signed opponent pairs. Opponent terms reverse direction when the teams swap. Pair coefficients with fewer than 20 training observations are omitted and add no adjustment. Hero-only and pair models are fitted with full-batch gradient descent and regularization, without player features or side intercept. Swapping teams complements the probability.

Tune each family over regularization values 0.001, 0.01 and 0.1 on validation only. Use pair terms only if they improve both validation log loss and Brier score over the current winner. Evaluate the selected model on the final holdout, without selecting on that test. The evaluation applies only to supported compositions, and explicitly reports abstentions. Model files stay local in models/; aggregate evaluation and candidate comparisons are in docs/baseline-evaluation.json. Rerunning training replaces the local baseline. The current run retained the hero-only model; pair features did not improve validation.

## Test a frozen model on later matches

Before importing a new sample or retraining, preserve models/baseline.json as models/prior-baseline.json. Then import a later batch and run npm run evaluate:later. This reports only matches whose start time is strictly after the prior model's saved timestamp, without refitting that model. Aggregate results go to docs/prospective-evaluation.json. This evaluation belongs to the frozen prior model, not the newly trained candidate.

## Daily reliability evidence

The separate calibration experiment uses `npm run calibration:prepare` once, followed by `npm run calibration:test` after fresh data accumulates. It retrains the fixed historical hero baseline on the original training partition; the earlier validation partition fits a fixed grid and the separate calibration partition selects between identity, temperature and monotone logit compression. These are reused exploratory development data, not untouched evaluation. No previously examined reliability matches or spent final-test labels enter fitting.

The candidate and deployed comparator are frozen locally. The final comparison uses only starts in the first 24 hours strictly after that freeze, requires at least 5000 matches and 95% common coverage, checks scoring hashes and announcement interruption, and claims a single-use marker before scoring. The candidate must improve log loss and Brier score over both the deployed comparator and its own unadjusted base. The command never deploys automatically. Run the reliability collector first so the fixed future window is available; readiness checks do not spend the test. The app and frozen reliability model remain unchanged.

Run `npm run reliability:check` to freeze the current baseline and begin a separate prospective evaluation. The first run writes an immutable local snapshot under ignored `data/reliability/`; subsequent runs keep that snapshot even if the application baseline changes. Changed scoring code stops collection. Never delete the snapshot to restart an unsuccessful result, and never use these matches for training or tuning.

Run the same command on later days to append fresh hourly windows, up to 24 windows per invocation. Each full hour starts after the freeze, with a two-hour completion delay. Saved windows are not fetched again. Requests use the community [Deadlock API](https://api.deadlock-api.com/docs); 2500-result caps and accepted counts are recorded. Late API ingestion can leave missing matches. Only hero compositions, outcome, match ID and start time are saved; no player identities or statistics enter prediction.

The aggregate `docs/reliability-evaluation.json` reports coverage, accuracy, log loss, Brier score, calibration bins and approximate 95% Wilson intervals, both overall and by America/Chicago date. Small or partial days are descriptive evidence, not a pass/fail certification. A 50–60% bin can test average confidence in that range, but cannot validate exactly 58%. Repeated reports do not constitute a significance test. Known later gameplay announcements stop sampling one hour before their timestamps; exact deployment times remain unverified. A new patch needs a separately planned experiment.

Collection is command-driven; no background scheduler is installed. Fresh multi-day evidence cannot exist at initialization. The active browser predictor is unchanged.

## Local browser interface

After importing and training, run npm run dev and open http://127.0.0.1:3000. Select six heroes per side and compare. The interface prevents repeated picks and shows training appearances for the selected heroes. It lists only heroes supported by the local model.

The server binds to the local machine only. No hosting, accounts, player identifiers or telemetry are configured. Restart the server after replacing the model or catalog; they are loaded at startup. Predictions reject malformed JSON, extra fields, invalid IDs and oversized bodies.

Current status: importer, experimental trained model, pair-feature comparison, frozen-model evaluation, command-line prediction and manual browser comparison. See docs/model-assessment.md for results and limitations. Draft recommendations and automatic match detection are still deferred.

## Application release

The manual app now includes per-team hero search, portraits, duplicate protection, swap/reset, validated lineup links, model-version evidence and an experimental draft assistant. Leave an own-team slot empty to request up to five suggested heroes. Estimates average 256 deterministic uniformly sampled legal completions; they are not validated counter-picks or causal gains. Portraits load from the approved Deadlock API asset host with referrers disabled. Missing portraits leave usable text controls. Lineup links contain hero IDs only; localhost links require the app running on the recipient's computer.

`/api/health` reports service readiness and version. `/api/evidence` exposes only aggregate evidence matching the current model hash, plus unsupported catalog heroes. Runtime requests never return weights, accounts or histories. Prediction and drafting reject extra fields, invalid compositions and oversized input. A bounded per-process 60-requests-per-minute limiter is best-effort protection, not a distributed quota; use hosting firewall controls for broader abuse protection.

For Vercel, the `api/index.ts` adapter and `vercel.json` are ready. Build with `npm run check`; serve public/ and rewrite /api routes to the shared function. Configure `MODEL_JSON` with the validated model object (not the entire baseline artifact) and `HEROES_JSON` with the sanitized catalog as encrypted server-only environment variables. Never prefix them for browser exposure or commit their values. These assets remain ignored locally. The hosted adapter is integration-tested, but production hosting is not yet verified: project creation was rejected by the current Vercel connection's write permissions. The public GitHub repository remains the source of truth. No hosting URL has been created.

Archive the current model with `npm run model:archive`; restore an archived version with `npm run model:archive -- <12-character-version>`. Restoration validates the artifact hash and saves the displaced model first. Restart the local app afterward. Hosted releases require updating the server environment and redeploying the reviewed Git commit; Vercel deployment rollback can restore the previous published deployment. The frozen reliability snapshot is independent and is never reset by a rollback.

Model updates use the research preparation/train/one-use-test workflow below. Preparation excludes saved reliability match IDs from all development partitions. A late gameplay announcement closes monitoring; legacy matches without completion timestamps are conservatively excluded from scoring if they start within three hours of the announcement, while the raw sanitized dataset is preserved. This corrected the final monitoring tally from 165,377 retained matches to 159,562 eligible matches. The exact initial 72-hour checkpoint is unchanged. Calibration based on the prior roster is blocked by the October 13 announcement; no new model is promoted without a new period and later test.

Automatic match-start detection is not implemented. The API's [active match endpoint](https://api.deadlock-api.com/docs) is limited to the top 200 watch-tab matches. Arbitrary match discovery and five-second latency are unverified. The manual app remains the supported workflow; no player identity is added to prediction.

## Nonlinear composition experiment

The separate `research:nonlinear` command trains [scikit-learn gradient-boosted trees](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.GradientBoostingClassifier.html) using signed hero-presence features only. Create a research-only Python environment with `python -m venv .venv`, then install `requirements-research.txt` using that environment's pip. On Windows: `.venv/Scripts/python.exe -m pip install -r requirements-research.txt`. The browser app still needs only Node.

Run `npm run reliability:check` to reserve a prospective reliability period, then `npm run research:nonlinear` against the existing research plan. The experiment reads training, validation and calibration only, verifies their hashes and distinct match IDs, and refuses development matches starting during the reserved reliability period. It does not read the previous spent final test. A frozen nonlinear candidate cannot be overwritten by rerunning this command.

The fixed grid is depth 2 or 3, 100 or 300 trees, learning rate 0.05, minimum 100 mirrored training rows per leaf, seed 42. Team-swapped training rows get opposite outcomes; scoring uses half the difference between original and swapped logits, guaranteeing complementary probabilities. JSON trees avoid pickle loading. Node verifies all four candidates' exported predictions against Python on every supported validation match before selection.

A logistic comparator trains on exactly the same earlier training set, selecting regularization on validation. It is distinct from the deployed model, which has seen newer matches. Select the tree configuration by validation log loss; it must beat the matched comparator on both log loss and Brier score to advance. Separate calibration data selects a temperature from the fixed existing grid. Validation and calibration remain exploratory development evidence, never final performance claims.

The first run trained on 5,474 matches and validated on 957 with 100% coverage. Trees picked 64.68% of winners versus 63.22% for the matched logistic comparator, but had worse log loss (0.63614 versus 0.63317) and Brier score (0.22256 versus 0.22152). The candidate was rejected at validation. It was not deployed or tested on spent final-test labels. The aggregate report is `docs/nonlinear-evaluation.json`; local trees and inputs stay ignored. Any advancing candidate would still need a separately planned fresh later test against the frozen deployed predictor; this command does not deploy.

## Frozen research protocol

```sh
npm run research:prepare
npm run research:train
npm run research:test
```

Preparation samples four recent official Steam gameplay-announcement periods, using one-hour windows at six-hour intervals in older periods and hourly windows in the newest. Windows exclude one hour around announcement boundaries. The API can cap a window at 2500 results, recorded in the plan. Requests are spaced by at least 2.2 seconds. This is stratified availability sampling, not a random sample or a census.

Announcement dates are boundary proxies. Feed contents identify updates or immediate hero releases; exact game build/deployment times are not known. Forum RSS publication dates can reflect later edits to old posts, so they are excluded. Older periods are stored separately; the deployment candidate trains only on the newest period.

The newest period gets time-based 50/20/15/15 training/validation/calibration/test partitions. Earlier matches whose completion time reaches the next cutoff are purged. Final-test starts must be later than legacy imported datasets and every previously prepared final-test window. At least 1000 training, 200 validation, 200 calibration and 500 final-test records are required. New imports never overwrite an existing experiment directory.

Training compares the six fixed hero-only/pair candidates on validation, then selects a positive temperature scale on separate calibration data. A temperature of one leaves probabilities unchanged; other scales adjust confidence while preserving team-swap symmetry. Candidate model, incumbent model and scoring-code hash are frozen before test access. Partition hashes detect changed data. Training will not overwrite a frozen candidate, and final evaluation writes a single-use marker before opening the test. If evaluation fails after opening, the test is still spent; prepare a new later experiment.

The candidate replaces the local model only if at least 500 common supported test matches have at least 95% coverage and both log loss and Brier score beat the frozen incumbent and 50/50. There is no retuning after final results. This gate uses point estimates and does not prove a statistically reliable improvement.

Local datasets, candidates and spent-test markers live under ignored data/research/. Aggregate plan and results are in docs/research-plan.json and docs/research-evaluation.json. Read docs/research-assessment.md for the first run. Calibration and test sampling are still short-period evidence, not proof of stable accuracy across patches.
