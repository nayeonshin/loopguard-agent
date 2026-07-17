# Loopguard

Loopguard is an autonomous on-call agent MVP for monitoring an intentionally breakable website, investigating regressions, applying safety policy, invoking tools, and showing the full incident timeline.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

To run the integrated local demo with Person 1's service:

```bash
npm run dev:backend
```

In a second terminal:

```bash
LOOPGUARD_TARGET_BASE_URL=http://localhost:4000 npm run dev
```

## Backend Service

Person 1's demo service is included under `src/` and listens on port `4000` by default.

Endpoints:

- `GET /` - Demo website
- `GET /health` - Health summary, including `expected_content_present`
- `GET /metrics` - Current metrics snapshot
- `GET /deployments` - Deployment history
- `POST /demo/deploy-broken` - Trigger the broken deployment
- `POST /demo/reset` - Return to the healthy baseline
- `POST /ops/restart` - Restart the current version
- `POST /ops/rollback` - Restore healthy `v1`

## Demo Flow

1. Start from the healthy `v1` state.
2. Trigger the broken deployment.
3. Observe the homepage degrade and the health signals flip.
4. Restart to confirm the issue stays broken.
5. Roll back to restore service.
6. Reset to return the demo to its clean baseline.

## Configuration

The app defaults to Person 1's service at `http://localhost:4000` and falls back to the built-in simulator if that service is not running.

```bash
LOOPGUARD_TARGET_BASE_URL=http://localhost:4000 npm run dev
```

Use `LOOPGUARD_USE_LOCAL_SIMULATOR=true` to force the built-in simulator.

The Person 1 backend contract is normalized through `lib/target.ts`:

- `/health` is the preferred source for `expected_content_present`.
- `/deployments` can return either `deployments` or `deployment_history`.
- Deployment timestamps prefer `created_at`, with `at` as a fallback.

## Shared Contract Notes

- Healthy state is `v1`.
- Broken state is `v2`, and the homepage itself visibly degrades instead of only reporting a synthetic flag.
- Restarting `v2` does not recover the service.
- Rolling back to `v1` restores service.
- Reset always returns the service to the original healthy baseline.
- Repeated incident cycles are deterministic: break -> restart -> rollback -> reset can be repeated without changing the contract.
- Deployment records include both `at` and `created_at` timestamps for compatibility with the agent side.
- Deployment history uses consistent `status` values (`healthy` or `degraded`) and stable `type` values (`initial`, `demo/deploy-broken`, `ops/restart`, `ops/rollback`).
- `/health` includes `expected_content_present` so the detection UI and policy logic can read the content signal without switching endpoints.
- Incident lifecycle actions publish live Nexla events through `NEXLA_WEBHOOK_URL`.
- If Nexla is not configured, the service still runs locally and reports adapter readiness in `/metrics`.
