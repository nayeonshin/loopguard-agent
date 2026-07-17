import http from "node:http";
import { URL } from "node:url";
import {
  deployBroken,
  resetState,
  restartCurrentVersion,
  rollbackToHealthy,
  state,
  stateSnapshot,
} from "./state.js";
import { createIntegrationAdapters } from "./adapters.js";

const port = Number(process.env.PORT || 4000);
const adapters = createIntegrationAdapters();
const nexlaHeartbeatIntervalMs = Number(process.env.NEXLA_HEARTBEAT_INTERVAL_MS || 0);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function renderHomePage() {
  return state.expectedContentPresent
    ? `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Loopguard Checkout</title>
  </head>
  <body>
    <main>
      <h1>Checkout</h1>
      <p>Status: healthy</p>
      <p>Version: ${state.version}</p>
    </main>
  </body>
</html>`
    : `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Loopguard Checkout</title>
  </head>
  <body>
    <main>
      <h1>Service degraded</h1>
      <p>The expected Checkout content is unavailable.</p>
      <p>Version: ${state.version}</p>
    </main>
  </body>
</html>`;
}

function buildStatusResponse() {
  return {
    ...stateSnapshot(),
    adapters: adapters.describe(),
  };
}

function withMethodNotAllowed(res, allowed) {
  res.writeHead(405, { Allow: allowed });
  res.end();
}

async function publishIncidentEvent(eventType) {
  const result = await adapters.nexla.sendProbe(eventType);
  return {
    nexla: result,
  };
}

function startNexlaHeartbeat() {
  if (!adapters.nexla.enabled || nexlaHeartbeatIntervalMs <= 0) {
    return;
  }

  const timer = setInterval(() => {
    void adapters.nexla.sendProbe("heartbeat");
  }, nexlaHeartbeatIntervalMs);

  timer.unref();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/") {
    if (state.health === "degraded") {
      await sleep(state.latencyMs);
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHomePage());
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      version: state.version,
      health: state.health,
      status: state.health,
      expected_content_present: state.expectedContentPresent,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/metrics") {
    sendJson(res, 200, buildStatusResponse());
    return;
  }

  if (req.method === "GET" && url.pathname === "/deployments") {
    sendJson(res, 200, {
      deployments: state.deploymentHistory,
      deployment_history: state.deploymentHistory,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/demo/deploy-broken") {
    deployBroken();
    const integrations = await publishIncidentEvent("deploy-broken");
    sendJson(res, 200, {
      ok: true,
      action: "deploy-broken",
      ...buildStatusResponse(),
      integrations,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/demo/reset") {
    resetState();
    const integrations = await publishIncidentEvent("reset");
    sendJson(res, 200, {
      ok: true,
      action: "reset",
      ...buildStatusResponse(),
      integrations,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/restart") {
    restartCurrentVersion();
    const integrations = await publishIncidentEvent("restart");
    sendJson(res, 200, {
      ok: true,
      action: "restart",
      ...buildStatusResponse(),
      integrations,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/rollback") {
    rollbackToHealthy();
    const integrations = await publishIncidentEvent("rollback");
    sendJson(res, 200, {
      ok: true,
      action: "rollback",
      ...buildStatusResponse(),
      integrations,
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    withMethodNotAllowed(res, "GET, POST");
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: "Not found",
    path: url.pathname,
  });
});

server.listen(port, () => {
  console.log(`Loopguard demo server listening on http://localhost:${port}`);
  if (!adapters.describe().nexlaConfigured && adapters.describe().nexlaRequired) {
    console.warn("Nexla is required for the hackathon flow but NEXLA_WEBHOOK_URL is not configured.");
  }
  startNexlaHeartbeat();
});

export { server };
