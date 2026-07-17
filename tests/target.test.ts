import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readTargetState } from "../lib/target";
import { resetDemo } from "../lib/store";

const previousEnv = {
  LOOPGUARD_TARGET_BASE_URL: process.env.LOOPGUARD_TARGET_BASE_URL
};

const servers: Server[] = [];

after(() => {
  for (const server of servers) {
    server.close();
  }
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    servers.push(server);
    server.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

test("target adapter falls back to local simulator when Person 1 service is unavailable", async () => {
  process.env.LOOPGUARD_TARGET_BASE_URL = "http://127.0.0.1:9";
  resetDemo();

  const state = await readTargetState();

  assert.equal(state.source, "local-simulator");
  assert.equal(state.metrics.version, "v1");
  assert.equal(state.metrics.expected_content_present, true);
});

test("target adapter accepts deployments with created_at or at timestamps", async () => {
  process.env.LOOPGUARD_TARGET_BASE_URL = "http://127.0.0.1:9";
  resetDemo();

  const state = await readTargetState();
  assert.equal(state.deployments[0].created_at.length > 0, true);
});

test("direct Person 1 backend reads are the monitoring source of truth", async () => {
  const backendUrl = await listen((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/health") {
      res.end(
        JSON.stringify({ status: "degraded", version: "v2", expected_content_present: false })
      );
      return;
    }
    if (req.url === "/metrics") {
      res.end(
        JSON.stringify({ version: "v2", health: "degraded", error_rate: 0.35, latency_ms: 950 })
      );
      return;
    }
    if (req.url === "/deployments") {
      res.end(
        JSON.stringify({
          deployment_history: [
            { version: "v2", status: "active", at: "2026-07-17T10:00:00.000Z" },
            { version: "v1", status: "superseded", created_at: "2026-07-16T10:00:00.000Z" }
          ]
        })
      );
      return;
    }
    res.end(JSON.stringify({}));
  });

  process.env.LOOPGUARD_TARGET_BASE_URL = backendUrl;
  resetDemo();

  const state = await readTargetState();

  assert.equal(state.source, backendUrl);
  assert.equal(state.metrics.health, "degraded");
  assert.equal(state.metrics.error_rate, 0.35);
  assert.equal(state.metrics.expected_content_present, false);
  assert.equal(state.deployments.length, 2);
  assert.equal(state.deployments[0].version, "v2");
  // created_at is preferred, with `at` as fallback for timestamps.
  assert.equal(state.deployments[0].created_at, "2026-07-17T10:00:00.000Z");
});
