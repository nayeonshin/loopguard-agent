# Loopguard Person 1 Demo Service

This service simulates the website and ops surface that Loopguard monitors.

## Run locally

```powershell
npm install
npm start
```

By default the server listens on port `4000` so it can run alongside a frontend or agent service on `3000`.

Nexla is required for the hackathon-ready flow. Configure it before running demo validation:

```powershell
$env:NEXLA_WEBHOOK_URL='https://your-nexla-webhook'
npm start
```

## Endpoints

- `GET /` - Demo website
- `GET /health` - Health summary
- `GET /metrics` - Current metrics snapshot
- `GET /deployments` - Deployment history
- `POST /demo/deploy-broken` - Trigger the broken deployment
- `POST /demo/reset` - Return to the healthy baseline
- `POST /ops/restart` - Restart the current version
- `POST /ops/rollback` - Restore healthy `v1`

## Shared contract notes

- Healthy state is `v1`
- Broken state is `v2` and the homepage itself visibly degrades instead of only reporting a synthetic flag
- Restarting `v2` does not recover the service
- Rolling back to `v1` restores service
- Reset always returns the service to the original healthy baseline
- Repeated incident cycles are deterministic: break -> restart -> rollback -> reset can be repeated without changing the contract
- Deployment records include both `at` and `created_at` timestamps for compatibility with the agent side
- Deployment history uses consistent `status` values (`healthy` or `degraded`) and stable `type` values (`initial`, `demo/deploy-broken`, `ops/restart`, `ops/rollback`)
- `/health` includes `expected_content_present` so the detection UI and policy logic can read the content signal without switching endpoints
- Incident lifecycle actions publish live Nexla events through `NEXLA_WEBHOOK_URL`
- Hackathon readiness requires Nexla to be configured; if it is missing, the service still runs locally but reports that Nexla is not ready
