# Release status

The manual composition app is implemented with supported-hero selection, search, portraits, composition prediction, validation evidence, lineup links and experimental partial-draft recommendations. The active model is 3debc4970fe5, with a frozen historical reliability snapshot. The predictor and draft feature accept composition only.

The October 13 20:59:55 UTC official gameplay announcement introduced a new roster period. Deadman Danny (78) is in the current catalog but unsupported by the active model. This is displayed in the interface; selections and recommendations do not invent a weight for him. The prior calibration candidate is preserved and blocked, with its final test unopened. The old reliability collector retains data and closes scoring at the boundary; no automatic retraining occurs.

Deployment source is prepared for Vercel with server-only model/catalog configuration, a shared API function, static assets, input validation, bounded best-effort request throttling and a health endpoint. Production project creation returned 403 because the connected Vercel account lacks project-creation access in julius-projects6. No project or public deployment was created. Reconnect with write access to that scope or choose an authorized hosting destination; then create the project, configure encrypted MODEL_JSON/HEROES_JSON, deploy the reviewed branch, and verify health, prediction, draft, share restoration and mobile behaviour on the production URL.

The new roster needs an independent research period with sufficient train/validation/calibration/final-test evidence. Reliability labels already used are excluded from development. Model promotion remains gated by the existing probability-quality and coverage requirements. Do not silently weaken the gate to accommodate unsupported new heroes.

Automatic detection is a feasibility limitation: the community active-match API only covers the top 200 watch-tab matches. Universal match discovery and five-second startup latency have not been established. A verified match source or supported local integration is required before implementing that later feature.

No full-draft strategy, causal recommendation quality, exact 58% calibration or future-patch accuracy is claimed. There is no public hosting, production performance test or verified automatic detection yet.
