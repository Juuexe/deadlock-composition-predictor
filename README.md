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

Current status: development foundation and composition type contract only. No trained model, web UI or prediction endpoint exists yet. The contract test checks the permitted TypeScript fields; runtime input validation will be added with the first input handler.
