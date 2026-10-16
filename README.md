# Deadlock Composition Predictor

## Setup

Install **Node.js 24.19.0**, npm and Git, then clone the repository:

```sh
git clone https://github.com/Juuexe/deadlock-composition-predictor.git
cd deadlock-composition-predictor
npm ci
npm run check
```

A fresh checkout needs a hero catalog and a trained local model before the app can start. Fetch a development sample and train a baseline:

```sh
npm run import:data -- 10000 1
npm run train
npm run dev
```

Open **http://127.0.0.1:3000**. If a local model and catalog already exist, skip import/training and run `npm run dev` directly.

The importer uses the community [Deadlock API](https://api.deadlock-api.com/docs). Its arguments are the maximum matches per daily window and the number of windows: `10000 1` requests up to 10,000 matches from one window. Training requires at least 1,000 matches after the newest observed hero enters the sample; insufficient data or API failures stop the command. A newly trained development model is separate from the deployed model and does not inherit its evaluation evidence. Rerunning import or training replaces local sample/model files; preserve any existing experiment first, and never train on reserved reliability matches or spent final tests.

Datasets and weights live in ignored `data/` and `models/` directories. They are not included in the repository. The app needs no database, player login or paid service. Python is only needed for the optional tree research experiment, not the browser app. `npm run check` runs strict TypeScript checks and the Node tests.

## What the app does

**[Open the live app](https://deadlock-composition-predictor.vercel.app)** to compare two Deadlock hero compositions.

- Select six distinct supported heroes on each team to get estimated win probabilities.
- Search heroes, swap teams, clear picks and share a lineup link containing hero IDs only.
- View training appearance counts and historical evaluation evidence tied to the active model version.
- Leave an own-team slot empty to request up to five experimental draft suggestions; choose one to fill the next slot.

Predictions use **hero composition only**. Player identities, skill, personal win rates, ranks, items and live gameplay are excluded as inputs. Historical compositions and outcomes come from the independent Deadlock API; personal fields returned upstream are discarded before storing matches. The app is an independent community project, not affiliated with Valve.

The deployed predictor currently uses learned hero-strength coefficients. Pair interactions, nonlinear models and extra calibration curves are research experiments, not active prediction features. Draft assistance is secondary and assumes uniformly sampled remaining picks; it is not a validated counter-pick strategy.

Predictions remain experimental. Unsupported heroes are unavailable for selection, and the interface names catalog heroes missing from the model. The active 42-hero model includes Deadman Danny. It passed a single-use chronological roster holdout; the old model's closed reliability period is separate and is not evidence for this new version. Exact probabilities and future-patch performance remain uncertain. Automatic match-start detection and live prediction are not implemented.

## Math and logic

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

Cross-entropy penalizes confidently wrong predictions heavily. The penalty discourages large coefficients fitted to noise; lambda controls its strength. Coefficients start at zero. Hero-only training takes 300 full-batch updates with learning rate 0.5; the pair experiment takes 1,000 with rate 0.05. This is a fixed optimization budget, not a proof that the exact mathematical optimum was reached. The research workflow compares lambda values 0.001, 0.01 and 0.1 on validation data. The deployed roster-update model uses 0.001.

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

Promotion requires at least 500 common supported test matches, at least 95% common coverage, and lower log loss and Brier score than both the frozen incumbent and 50/50. These are point-estimate gates, not statistical proof of improvement. A separately frozen [roster-expansion policy](docs/roster-protocol.md) handles added heroes: require 95% candidate coverage and at least 500 scored matches overall, on shared heroes, and for each new hero. Beat the incumbent and 50/50 on shared matches, and 50/50 overall and on each new-hero cohort, using both probability losses. The original same-roster gate is unchanged. A spent test cannot become another tuning set. Separately frozen prospective reliability matches are excluded from development. Announcement boundaries end a period rather than silently mixing new balance conditions into an old claim.

### 7. Draft recommendations reuse the predictor

Draft assistance accepts zero to five own heroes and zero to six opposing heroes. For every supported, unpicked candidate h, it places h in the next own-team slot, fills all remaining slots without duplicates using 256 deterministic pseudorandom legal completions, and averages the resulting predictions:

```text
draft_score(h) = (1/256) * sum_s P(A wins | completion_s with h on A)
```

Unfilled heroes are sampled uniformly from the remaining supported pool. The same seeded shuffled orders are reused across candidates to make comparisons reproducible. The app returns the five highest averages, breaking ties by hero ID. A recommendation percentage is an average over assumed completions, not the probability of an already known final composition. It does not simulate real pick popularity, bans, opponent strategy or player preferences, and it does not prove a causal improvement from choosing a hero. The simulation average is not a confidence interval.

Implementation: [src/draft.ts](src/draft.ts). The primary product remains full-composition prediction; draft assistance is an experimental extension of that same model.
