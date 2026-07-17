import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { request } from "node:http";

process.env.PORT = "0";
process.env.NEXLA_WEBHOOK_URL = "https://example.nexla.test/webhook";
process.env.NEXLA_HEARTBEAT_INTERVAL_MS = "0";
const nexlaCalls = [];
global.fetch = async (url, init = {}) => {
  nexlaCalls.push({
    url,
    method: init.method,
    body: init.body ? JSON.parse(init.body) : null,
  });
  return {
    ok: true,
    status: 202,
  };
};

const { server } = await import("../src/server.js");
await once(server, "listening");
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

async function fetchResponse(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = request(baseUrl + path, { method }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function parseJsonResponse(response) {
  return JSON.parse(response.body);
}

function clearNexlaCalls() {
  nexlaCalls.length = 0;
}

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("healthy state exposes expected content and metrics", async () => {
  clearNexlaCalls();
  const home = await fetchResponse("/");
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /Checkout/);
  assert.match(home.body, /healthy/);

  const health = await fetchResponse("/health");
  const healthJson = JSON.parse(health.body);
  assert.equal(healthJson.version, "v1");
  assert.equal(healthJson.health, "healthy");
  assert.equal(healthJson.status, "healthy");
  assert.equal(healthJson.expected_content_present, true);

  const metrics = parseJsonResponse(await fetchResponse("/metrics"));
  assert.equal(metrics.version, "v1");
  assert.equal(metrics.health, "healthy");
  assert.equal(metrics.expected_content_present, true);
  assert.equal(metrics.last_action, "reset");
  assert.equal(metrics.adapters.nexlaEnabled, true);
  assert.equal(metrics.adapters.nexlaRequired, true);
  assert.equal(metrics.adapters.nexlaConfigured, true);
  assert.equal(metrics.adapters.nexlaReady, true);

  const deployments = parseJsonResponse(await fetchResponse("/deployments"));
  assert.ok(Array.isArray(deployments.deployments));
  assert.ok(deployments.deployments[0].created_at);
  assert.ok(deployments.deployments[0].at);
  assert.equal(deployments.deployments[0].status, "healthy");
  assert.equal(deployments.deployments[0].type, "initial");
});

test("broken deployment, restart, rollback, and reset behave deterministically", async () => {
  clearNexlaCalls();
  const healthyBeforeBreak = await fetchResponse("/");
  assert.match(healthyBeforeBreak.body, /Checkout/);

  const broken = parseJsonResponse(await fetchResponse("/demo/deploy-broken", "POST"));
  assert.equal(broken.version, "v2");
  assert.equal(broken.health, "degraded");
  assert.equal(broken.expected_content_present, false);
  assert.equal(broken.last_action, "deploy-broken");
  assert.equal(broken.deployment_history.at(-1).status, "degraded");
  assert.equal(broken.integrations.nexla.ok, true);

  const brokenHome = await fetchResponse("/");
  assert.match(brokenHome.body, /Service degraded/);
  assert.doesNotMatch(brokenHome.body, /<h1>Checkout<\/h1>/);

  const restart = parseJsonResponse(await fetchResponse("/ops/restart", "POST"));
  assert.equal(restart.version, "v2");
  assert.equal(restart.health, "degraded");
  assert.equal(restart.expected_content_present, false);
  assert.equal(restart.deployment_history.at(-1).type, "ops/restart");
  assert.equal(restart.deployment_history.at(-1).status, "degraded");
  assert.equal(restart.integrations.nexla.ok, true);

  const rollback = parseJsonResponse(await fetchResponse("/ops/rollback", "POST"));
  assert.equal(rollback.version, "v1");
  assert.equal(rollback.health, "healthy");
  assert.equal(rollback.expected_content_present, true);
  assert.equal(rollback.deployment_history.at(-1).type, "ops/rollback");
  assert.equal(rollback.deployment_history.at(-1).status, "healthy");
  assert.equal(rollback.integrations.nexla.ok, true);

  const recoveredHome = await fetchResponse("/");
  assert.match(recoveredHome.body, /Checkout/);

  const reset = parseJsonResponse(await fetchResponse("/demo/reset", "POST"));
  assert.equal(reset.version, "v1");
  assert.equal(reset.health, "healthy");
  assert.equal(reset.expected_content_present, true);
  assert.equal(reset.last_action, "reset");
  assert.equal(reset.deployment_history.length, 1);
  assert.equal(reset.deployment_history[0].type, "initial");
  assert.equal(reset.integrations.nexla.ok, true);
  assert.deepEqual(
    nexlaCalls.map((call) => call.body.event_type),
    ["deploy-broken", "restart", "rollback", "reset"],
  );
});

test("repeated incident cycles return to a clean baseline", async () => {
  clearNexlaCalls();
  const firstBroken = parseJsonResponse(await fetchResponse("/demo/deploy-broken", "POST"));
  assert.equal(firstBroken.version, "v2");
  assert.equal(firstBroken.deployment_history.at(-1).type, "demo/deploy-broken");

  const firstRestart = parseJsonResponse(await fetchResponse("/ops/restart", "POST"));
  assert.equal(firstRestart.version, "v2");
  assert.equal(firstRestart.health, "degraded");

  const firstRollback = parseJsonResponse(await fetchResponse("/ops/rollback", "POST"));
  assert.equal(firstRollback.version, "v1");
  assert.equal(firstRollback.health, "healthy");

  const firstReset = parseJsonResponse(await fetchResponse("/demo/reset", "POST"));
  assert.equal(firstReset.deployment_history.length, 1);
  assert.equal(firstReset.deployment_history[0].deploymentId, 1);
  assert.equal(firstReset.deployment_history[0].status, "healthy");

  const secondBroken = parseJsonResponse(await fetchResponse("/demo/deploy-broken", "POST"));
  assert.equal(secondBroken.version, "v2");
  assert.equal(secondBroken.health, "degraded");
  assert.equal(secondBroken.deployment_history.length, 2);
  assert.equal(secondBroken.deployment_history[0].deploymentId, 1);
  assert.equal(secondBroken.deployment_history[1].status, "degraded");

  const deployments = parseJsonResponse(await fetchResponse("/deployments"));
  assert.equal(deployments.deployments.length, 2);
  assert.equal(deployments.deployment_history.length, 2);
  assert.ok(deployments.deployments.every((entry) => entry.created_at));
  assert.ok(deployments.deployments.every((entry) => entry.at));
});

test("nexla publishing failures do not break local endpoint responses", async () => {
  global.fetch = async () => {
    throw new Error("Nexla unavailable");
  };

  const broken = parseJsonResponse(await fetchResponse("/demo/deploy-broken", "POST"));
  assert.equal(broken.version, "v2");
  assert.equal(broken.integrations.nexla.ok, false);
  assert.match(broken.integrations.nexla.reason, /Nexla unavailable/);

  const brokenHome = await fetchResponse("/");
  assert.match(brokenHome.body, /Service degraded/);

  global.fetch = async (url, init = {}) => {
    nexlaCalls.push({
      url,
      method: init.method,
      body: init.body ? JSON.parse(init.body) : null,
    });
    return {
      ok: true,
      status: 202,
    };
  };

  const reset = parseJsonResponse(await fetchResponse("/demo/reset", "POST"));
  assert.equal(reset.version, "v1");
  assert.equal(reset.health, "healthy");
});
