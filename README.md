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

1. Start from the healthy `v1` simulator state.
2. Click **Break deployment**.
3. Click **Run agent cycle** to detect, investigate, authorize, act, verify, replan, rollback, and resolve.
4. Click **Test denied action** to show a restricted `deploy_code` action being denied and escalated.

## Configuration

The app defaults to Person 1's service at `http://localhost:4000` and falls back to the built-in simulator if that service is not running.

```bash
LOOPGUARD_TARGET_BASE_URL=http://localhost:4000 npm run dev
```

Use `LOOPGUARD_USE_LOCAL_SIMULATOR=true` to force the built-in simulator.

The Person 1 contract is normalized through `lib/target.ts`:

- `/health` is the preferred source for `expected_content_present`.
- `/deployments` can return either `deployments` or `deployment_history`.
- Deployment timestamps prefer `created_at`, with `at` as a fallback.
