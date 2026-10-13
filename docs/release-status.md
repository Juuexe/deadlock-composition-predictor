# Release status

The manual composition app is implemented with supported-hero selection, search, portraits, composition prediction, validation evidence, lineup links and experimental partial-draft recommendations. The active model is 3debc4970fe5, with a frozen historical reliability snapshot. The predictor and draft feature accept composition only.

The October 13 20:59:55 UTC official gameplay announcement introduced a new roster period. Deadman Danny (78) is in the current catalog but unsupported by the active model. This is displayed in the interface; selections and recommendations do not invent a weight for him. The prior calibration candidate is preserved and blocked, with its final test unopened. The old reliability collector retains data and closes scoring at the boundary; no automatic retraining occurs.

The experimental public beta is live at https://deadlock-composition-predictor.vercel.app in julius-projects6. Vercel CLI authentication resolved the earlier connector permission failure. Server-only MODEL_JSON/HEROES_JSON are encrypted secrets; datasets and model files were excluded from the upload. Production health, hero catalog, matching aggregate evidence, prediction, draft suggestions, share restoration and rejection of invalid/player inputs were verified. Private data/model/environment URLs returned 404. All 32 tests and the repository type check passed in the hosted build. The platform's separate TypeScript transpilation emitted a node type-definition warning, although deployment and runtime checks succeeded; inspect this on the next platform/compiler upgrade.

The new roster needs an independent research period with sufficient train/validation/calibration/final-test evidence. Reliability labels already used are excluded from development. Model promotion remains gated by the existing probability-quality and coverage requirements. Do not silently weaken the gate to accommodate unsupported new heroes.

Automatic detection is a feasibility limitation: the community active-match API only covers the top 200 watch-tab matches. Universal match discovery and five-second startup latency have not been established. A verified match source or supported local integration is required before implementing that later feature.

No full-draft strategy, causal recommendation quality, exact 58% calibration or future-patch accuracy is claimed. Production load testing and automatic detection remain unverified. The current model has no established performance for the new roster period.
