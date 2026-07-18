# Loopguard

Loopguard is an autonomous on-call agent demo. It monitors a real breakable web service, investigates regressions, applies policy-guarded recovery actions, verifies outcomes, and publishes incident signals to Nexla.

## What Runs Where

- Frontend and agent UI: `http://localhost:3000`
- Person 1 monitored service: `http://localhost:4000`
- Nexla publishing: outbound webhook calls from the backend on service state changes

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start the Person 1 backend:

```bash
npm run dev:backend
```

3. Start the Next.js frontend in a second terminal.

PowerShell:

```powershell
$env:LOOPGUARD_TARGET_BASE_URL="http://localhost:4000"
npm run dev
```

Command Prompt:

```cmd
set LOOPGUARD_TARGET_BASE_URL=http://localhost:4000
npm run dev
```

4. Open `http://localhost:3000`.

## Running the Full Demo

Baseline flow:

1. Confirm the backend homepage on `http://localhost:4000` shows healthy `v1` content including `Checkout`.
2. Trigger `POST /demo/deploy-broken`.
3. Confirm the homepage is actually broken and `expected_content_present` becomes `false`.
4. Trigger `POST /ops/restart` and confirm the service stays broken.
5. Trigger `POST /ops/rollback` and confirm the homepage and health signals recover.
6. Trigger `POST /demo/reset` and confirm the system returns to the original healthy baseline.

## Backend Service Contract

The monitored service lives under `src/` and listens on port `4000` by default.

Endpoints:

- `GET /` - monitored website
- `GET /health` - health summary, including `expected_content_present`
- `GET /metrics` - current metrics snapshot and Nexla adapter readiness
- `GET /deployments` - deployment history
- `POST /demo/deploy-broken` - trigger the broken deployment
- `POST /demo/reset` - return to the healthy baseline
- `POST /ops/restart` - restart the current version
- `POST /ops/rollback` - restore healthy `v1`

Contract guarantees:

- Healthy state is `v1`.
- Broken state is `v2`.
- The broken state is real request-path behavior, not only a synthetic flag.
- Restarting `v2` does not recover the service.
- Rolling back to `v1` restores service.
- Reset always returns the service to the original healthy baseline.
- Repeated cycles are deterministic: `break -> restart -> rollback -> reset`.
- `/health` includes `expected_content_present`.
- `/deployments` returns both `deployments` and `deployment_history`.
- Deployment records include both `created_at` and `at`.

## Nexla Configuration

Nexla is part of the hackathon flow. The backend publishes structured incident events through a Nexla webhook when service state changes.

Set these environment variables before starting `npm run dev:backend`:

PowerShell:

```powershell
$env:NEXLA_WEBHOOK_URL="<your Nexla hosted webhook URL>"
$env:NEXLA_AUTH_HEADER="Authorization"
$env:NEXLA_AUTH_TOKEN="<optional token if your source requires one>"
npm run dev:backend
```

Command Prompt:

```cmd
set NEXLA_WEBHOOK_URL=<your Nexla hosted webhook URL>
set NEXLA_AUTH_HEADER=Authorization
set NEXLA_AUTH_TOKEN=<optional token if your source requires one>
npm run dev:backend
```

Notes:

- Do not commit the live Nexla webhook URL or token.
- If Nexla is misconfigured or unavailable, local endpoints still respond and `/metrics` reports Nexla readiness.
- The backend emits lifecycle events for broken deploy, restart, rollback, and reset.

## Frontend and Agent Configuration

The frontend targets the Person 1 backend through `LOOPGUARD_TARGET_BASE_URL`.

Supported API routes under `app/api/` include:

- `agent`
- `autopilot`
- `demo/deploy-broken`
- `demo/reset`
- `deployments`
- `events`
- `health`
- `integrations/denied-action`
- `metrics`
- `ops/restart`
- `ops/rollback`

The target integration is normalized through `lib/target.ts`:

- `/health` is the preferred source for `expected_content_present`
- `/deployments` accepts either `deployments` or `deployment_history`
- deployment timestamps prefer `created_at`, with `at` as a fallback

## Tests

Backend tests:

```bash
npm run test:backend
```

Agent and frontend-side logic tests:

```bash
npm run test:agent
```

Run the full test suite:

```bash
npm test
```
