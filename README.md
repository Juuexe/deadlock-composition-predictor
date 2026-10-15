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

The server binds to the local machine only. Local mode requires no hosting, accounts or player identifiers. The public experimental beta is https://deadlock-composition-predictor.vercel.app. Restart the server after replacing the model or catalog; they are loaded at startup. Predictions reject malformed JSON, extra fields, invalid IDs and oversized bodies.

Current status: experimental composition prediction, research evaluation, manual browser comparison and draft assistance. See docs/model-assessment.md for historical results and docs/release-status.md for release blockers. Automatic match detection remains deferred.

## Application release

The manual app now includes per-team hero search, portraits, duplicate protection, swap/reset, validated lineup links, model-version evidence and an experimental draft assistant. Leave an own-team slot empty to request up to five suggested heroes. Estimates average 256 deterministic uniformly sampled legal completions; they are not validated counter-picks or causal gains. Portraits load from the approved Deadlock API asset host with referrers disabled. Missing portraits leave usable text controls. Lineup links contain hero IDs only; localhost links require the app running on the recipient's computer.

`/api/health` reports service readiness and version. `/api/evidence` exposes only aggregate evidence matching the current model hash, plus unsupported catalog heroes. Runtime requests never return weights, accounts or histories. Prediction and drafting reject extra fields, invalid compositions and oversized input. A bounded per-process 60-requests-per-minute limiter is best-effort protection, not a distributed quota; use hosting firewall controls for broader abuse protection.

For Vercel, the `api/index.ts` adapter and `vercel.json` are ready. Build with `npm run check`; serve public/ and rewrite /api routes to the shared function. Configure `MODEL_JSON` with the validated model object (not the entire baseline artifact) and `HEROES_JSON` with the sanitized catalog as encrypted server-only environment variables. Never prefix them for browser exposure or commit their values. These assets remain ignored locally. The experimental beta is deployed at https://deadlock-composition-predictor.vercel.app. Hosted health, prediction, draft suggestions, lineup restoration, validation and private-path checks passed. The public GitHub repository remains the source of truth; deployments currently use the CLI from the reviewed branch. See docs/release-status.md for remaining limitations.

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

## The math and logic behind the application

### What the prediction means

The input is two sets of six distinct, supported hero IDs. The model estimates `P(team A wins | team A heroes, team B heroes)` from historical match outcomes. It does not receive player identities, ranks, personal win rates, items, lanes or live match events. Match IDs and timestamps support deduplication and chronological evaluation; they are not prediction features. Outcomes are the labels used to learn.

A displayed 58% means the model estimates a 0.58 probability for that composition. It is not a guarantee, an individual player's chance, or proof that those heroes cause victory. Hidden factors such as player skill can still influence the historical outcomes even though the software excludes them as inputs. The estimate reflects the sampled match population and can change in usefulness after a roster or balance update.

### 1. Turn two compositions into a score

The deployed model is regularized logistic regression with one learned coefficient `w_h` per hero. Define a feature for every supported hero:

```text
x_h = +1 if hero h is on team A
      -1 if hero h is on team B
       0 if hero h is absent

z = sum_h(w_h * x_h)
  = sum of team A hero weights - sum of team B hero weights
p_A = sigmoid(z / T) = 1 / (1 + exp(-z / T))
p_B = 1 - p_A
```

The active model uses `T = 1`, so no temperature adjustment is applied. A positive score favors A; zero gives 50%; a negative score favors B. For example, hypothetical team totals of 0.42 and 0.10 give `z = 0.32` and `p_A ≈ 57.9%`. These numbers illustrate the calculation and are not actual hero coefficients. Conversely, 58% corresponds to a score of `ln(0.58 / 0.42) ≈ 0.323` when T is one.

Weights are learned jointly from complete compositions and outcomes, rather than averaging individual hero win rates. A coefficient describes a fitted contribution to log odds in this model; it is not a standalone hero win percentage. Because both teams always contain six heroes, adding the same constant to every hero weight cancels out. Relative team totals determine the prediction.

There is no intercept or team-side bonus. Swapping the teams changes `z` to `-z`, so the probabilities complement each other. Hero selection order has no effect. Missing hero weights cause rejection rather than silently assigning a neutral value. Training appearance counts are displayed as support information; they do not multiply the score or provide a confidence interval for a particular lineup.

Implementation: [src/model.ts](src/model.ts), [src/composition.ts](src/composition.ts), [src/server.ts](src/server.ts).

### 2. Learn weights from wins and losses

For match i, `y_i = 1` when A wins and `0` when B wins. Training minimizes average binary cross-entropy plus an L2 penalty:

```text
L(w) = -(1/N) * sum_i[y_i * ln(p_i) + (1-y_i) * ln(1-p_i)]
       + (lambda/2) * sum_h(w_h²)

gradient_h = (1/N) * sum_i[(p_i-y_i) * x_ih] + lambda * w_h
w_h <- w_h - learning_rate * gradient_h
```

Cross-entropy penalizes confidently wrong predictions heavily. The penalty discourages large coefficients fitted to noise; lambda controls its strength. Coefficients start at zero. Hero-only training takes 300 full-batch updates with learning rate 0.5; the pair experiment takes 1,000 with rate 0.05. This is a fixed optimization budget, not a proof that the exact mathematical optimum was reached. The research workflow compares lambda values 0.001, 0.01 and 0.1 on validation data. The deployed baseline uses 0.01.

### 3. Optional interactions and nonlinear research

An experimental pair model adds terms to the same score:

```text
z_pairs = z_heroes
          + sum of ally-pair coefficients on A
          - sum of ally-pair coefficients on B
          + sum of signed opposing-pair coefficients
```

Each six-hero team has 15 unordered ally pairs, and a full match has 36 opposing pairs. An opposing coefficient is stored under the smaller/larger hero IDs; its sign is positive when the smaller ID is on A and negative when it is on B. This is a storage convention that preserves team-swap symmetry, not a claim that smaller IDs are stronger. Pair terms with fewer than 20 training observations are omitted and contribute zero. Pair coefficients use the same regularized learning objective. These terms are not active in the deployed predictor because the experiments did not earn promotion.

The tree experiment uses the same signed hero features, but trees can learn conditional combinations. If its raw tree score is `f(x)`, prediction uses `sigmoid((f(x)-f(-x))/(2*T))`, ensuring complementary probabilities after a swap. Mirrored training examples reverse features and labels. The candidate picked more winners in validation but produced worse probability scores, so it was rejected. Neither extra complexity nor higher winner accuracy alone justifies deployment.

Implementation: [src/nonlinear.ts](src/nonlinear.ts), [research/train_trees.py](research/train_trees.py).

### 4. Calibration adjusts confidence

Temperature calibration chooses a positive T on separate calibration data by log loss. `T > 1` moves predictions toward 50%; `T < 1` moves them away from 50%. It preserves hero ordering, the favored team and swap symmetry.

A separate exploratory calibration curve uses:

```text
l = ln(p / (1-p))
l_adjusted = a*l / (1 + b*abs(l))
p_adjusted = sigmoid(l_adjusted), with a > 0 and b >= 0
```

Here a scales confidence and b compresses extreme scores. Identity is `a = 1, b = 0`; temperature scaling corresponds to `a = 1/T, b = 0`. This curve is research-only and is not applied by the public app. Its old-roster final comparison remains blocked by the announcement boundary.

Implementation: [src/calibration.ts](src/calibration.ts).

### 5. Measure whether the probabilities are useful

Evaluation uses supported matches and compares the model with a constant 50/50 prediction:

| Measure | Calculation | Interpretation |
| --- | --- | --- |
| Winner accuracy | Fraction where the side above 50% wins; an exact tie gets half credit | Higher is better, but ignores confidence |
| Log loss | `-mean(y*ln(p) + (1-y)*ln(1-p))` | Lower is better; confident mistakes are costly |
| Brier score | `mean((p-y)²)` | Lower is better; squared probability error |
| Coverage | Supported eligible matches / all eligible collected matches | Shows how often the model can score the collected population |
| Calibration | Mean predicted probability versus actual A-win frequency within a probability bin | Tests whether confidence agrees with outcomes |

A 50/50 predictor has log loss `ln(2) ≈ 0.6931`, Brier score 0.25 and tie-adjusted accuracy 50%. Log-loss evaluation clips probabilities to `[1e-15, 1-1e-15]` to avoid taking the logarithm of zero. Calibration reporting groups A-win probabilities into ten 10-percentage-point bins. A bin averaging 58% should have approximately 58% A wins over sufficient comparable matches; this does not establish accuracy for every exact lineup or exactly 58%.

Reliability reports use approximate 95% Wilson intervals for observed proportions. With observed proportion q, count n and c = 1.96:

```text
center = (q + c²/(2n)) / (1 + c²/n)
radius = c*sqrt(q*(1-q)/n + c²/(4n²)) / (1 + c²/n)
interval = [center-radius, center+radius], bounded to [0,1]
```

Small samples give wide intervals. These are descriptive intervals under binomial assumptions, not corrections for API sampling bias, dependence between matches, repeated inspection or future patch changes. Accuracy intervals also use the half-credit tie convention and are approximate. Coverage measures supported heroes among collected matches, not the fraction of all Deadlock matches captured by the API.

Implementation: [src/reliability.ts](src/reliability.ts).

### 6. Keep learning separate from proof

The current research pipeline splits matches chronologically into 50% training, 20% validation, 15% calibration and 15% final test, with completion-time purging around cutoffs. Training learns coefficients; validation selects the model; calibration selects confidence scaling; the final test measures the frozen candidate once. An earlier baseline workflow used 70/15/15; it is distinct from this four-part protocol.

Promotion requires at least 500 common supported test matches, at least 95% common coverage, and lower log loss and Brier score than both the frozen incumbent and 50/50. These are point-estimate gates, not statistical proof of improvement. A spent test cannot become another tuning set. Separately frozen prospective reliability matches are excluded from development. Announcement boundaries end a period rather than silently mixing new balance conditions into an old claim.

The public model's eligible historical monitoring report contains 159,562 matches: about 60.4% winner accuracy, 0.6606 log loss and 0.2342 Brier score, with 100% supported coverage in that collected period. Those results concern the closed prior period; they do not validate the new roster or promise the same performance tomorrow.

### 7. Draft recommendations reuse the predictor

Draft assistance accepts zero to five own heroes and zero to six opposing heroes. For every supported, unpicked candidate h, it places h in the next own-team slot, fills all remaining slots without duplicates using 256 deterministic pseudorandom legal completions, and averages the resulting predictions:

```text
draft_score(h) = (1/256) * sum_s P(A wins | completion_s with h on A)
```

Unfilled heroes are sampled uniformly from the remaining supported pool. The same seeded shuffled orders are reused across candidates to make comparisons reproducible. The app returns the five highest averages, breaking ties by hero ID. A recommendation percentage is an average over assumed completions, not the probability of an already known final composition. It does not simulate real pick popularity, bans, opponent strategy or player preferences, and it does not prove a causal improvement from choosing a hero. The simulation average is not a confidence interval.

Implementation: [src/draft.ts](src/draft.ts). The primary product remains full-composition prediction; draft assistance is an experimental extension of that same model.
