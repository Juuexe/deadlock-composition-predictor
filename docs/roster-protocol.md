# Roster expansion evaluation

This protocol handles a candidate that adds heroes the incumbent cannot score. It is separate from the existing same-roster promotion gate; that gate remains unchanged. The old model continues to abstain on unsupported heroes. No neutral weight is invented for a new hero.

Before the final test opens, freeze the candidate with `npm run research:train` and freeze this policy, partition hashes, candidate hash and scoring-source hash with `npm run roster:freeze`. Then `npm run roster:test` claims the same exclusive one-use test marker as the original research runner before reading final-test labels. A changed protocol, scoring code, candidate, partition or intersecting later announcement stops the comparison. Test results never trigger automatic deployment.

Release review requires all of the following:

- Retain every incumbent hero and add at least one hero.
- Score at least 95% of the eligible collected test matches. At least 500 scored matches must beat 50/50 on both log loss and Brier score overall.
- On matches supported by the incumbent, retain at least 95% candidate coverage and at least 500 common scored matches. Beat both the frozen incumbent and 50/50 on both probability metrics.
- For **each** added hero, retain at least 95% coverage among its test matches and at least 500 scored matches. Beat 50/50 on both log loss and Brier score. These matches can overlap the overall cohort; they are not independent additional experiments.

This is an explicit coverage-expansion policy, not a claim that a new hero can be compared with an incumbent that has no coefficient for it. There is no equivalent incumbent comparison on new-hero games. Passing point estimates is a screening rule, not statistical certification; calibrated odds, sampling representativeness and future-day performance remain unverified. No post-test tuning or repeated model selection is allowed.

Historical reliability matches and spent tests remain excluded from development. The app's old frozen reliability snapshot is preserved even if a new model later passes review; it is not evidence for that new model. New models need separate prospective monitoring.
