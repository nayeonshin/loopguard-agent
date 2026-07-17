# Loopguard Person 1 Demo Service

This service simulates the website and ops surface that Loopguard monitors.

## Run locally

```powershell
npm install
npm start
```

By default the server listens on port `4000` so it can run alongside a frontend or agent service on `3000`.

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
- Broken state is `v2`
- Restarting `v2` does not recover the service
- Rolling back to `v1` restores service
- Deployment records include both `at` and `created_at` timestamps for compatibility with the agent side
- `/health` includes `expected_content_present` so the detection UI and policy logic can read the content signal without switching endpoints
