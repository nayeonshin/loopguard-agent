import http from "node:http";
import { URL } from "node:url";
import {
  deployBroken,
  metricsSnapshot,
  resetState,
  restartCurrentVersion,
  rollbackToHealthy,
  state,
} from "./state.js";
import { createIntegrationAdapters } from "./adapters.js";

const port = Number(process.env.PORT || 3000);
const adapters = createIntegrationAdapters();

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
    ...metricsSnapshot(),
    last_action: state.lastAction,
    deployment_history: state.deploymentHistory,
    adapters: adapters.describe(),
  };
}

function withMethodNotAllowed(res, allowed) {
  res.writeHead(405, { Allow: allowed });
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHomePage());
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      version: state.version,
      health: state.health,
      status: state.health,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/metrics") {
    sendJson(res, 200, buildStatusResponse());
    return;
  }

  if (req.method === "GET" && url.pathname === "/deployments") {
    sendJson(res, 200, {
      deployment_history: state.deploymentHistory,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/demo/deploy-broken") {
    deployBroken();
    sendJson(res, 200, {
      ok: true,
      action: "deploy-broken",
      ...buildStatusResponse(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/demo/reset") {
    resetState();
    sendJson(res, 200, {
      ok: true,
      action: "reset",
      ...buildStatusResponse(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/restart") {
    restartCurrentVersion();
    sendJson(res, 200, {
      ok: true,
      action: "restart",
      ...buildStatusResponse(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/rollback") {
    rollbackToHealthy();
    sendJson(res, 200, {
      ok: true,
      action: "rollback",
      ...buildStatusResponse(),
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
});

export { server };
