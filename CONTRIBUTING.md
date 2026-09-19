# Contributing

Use Node 24, run `npm install`, and start the local app with `npm run dev`.

Before submitting changes:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

Keep live API calls isolated in the Jev provider. Unit and integration tests must remain credential-free. Label authored fixtures and captured responses honestly; never commit API keys or non-synthetic telemetry. New scenarios need schema validation and meaningful policy expectations. Network attacks must remain event records, with no external attack traffic.

Prefer small modules and explicit feature definitions. Keep policy deterministic, explain probability versus confidence correctly, and test legitimate automation and authorized anomalies alongside malicious scenarios. Run the complete replay in a browser when changing choreography or containment visuals.

The code is formatted with Prettier (`npm run format`). Generated SQLite, browser traces, and build output are gitignored.
