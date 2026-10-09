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

The optional limit is 1–10000; default 1000. The importer makes one hero request and one bulk match request, with a 60-second timeout per request. HTTP failures stop the import; rerun later after rate limiting. It uses the latest normal ranked/unranked matches, excluding unscored games, incomplete teams, malformed fields and duplicate heroes.

Local ignored outputs: data/heroes.json, data/matches.json and data/import-summary.json. The saved match fields are matchId, startedAt, teamA, teamB and winner. Account IDs, skill badges, items and performance statistics returned by the upstream API are discarded before storage. Unzoned API timestamps are interpreted as UTC. Each file is replaced atomically after validation; the three files are not a single transaction. Run one importer at a time.

The sample is for verifying the pipeline, not for claiming prediction accuracy. It contains recent fetched matches, which may be unrepresentative. Training needs broader history, patch boundaries and chronological evaluation; start-time alone is not a verified patch label. The current hero catalog is stored separately and historical heroes are retained rather than silently removed.

Current status: a tested composition-only importer and contract. No trained model, web UI or prediction endpoint exists yet.
