import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { request } from "node:http";

process.env.PORT = "0";
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

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("healthy state exposes expected content and metrics", async () => {
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

  const metrics = JSON.parse((await fetchResponse("/metrics")).body);
  assert.equal(metrics.version, "v1");
  assert.equal(metrics.health, "healthy");
  assert.equal(metrics.expected_content_present, true);

  const deployments = JSON.parse((await fetchResponse("/deployments")).body);
  assert.ok(Array.isArray(deployments.deployments));
  assert.ok(deployments.deployments[0].created_at);
  assert.ok(deployments.deployments[0].at);
});

test("broken deployment, restart, rollback, and reset behave deterministically", async () => {
  const broken = JSON.parse((await fetchResponse("/demo/deploy-broken", "POST")).body);
  assert.equal(broken.version, "v2");
  assert.equal(broken.health, "degraded");
  assert.equal(broken.expected_content_present, false);

  const restart = JSON.parse((await fetchResponse("/ops/restart", "POST")).body);
  assert.equal(restart.version, "v2");
  assert.equal(restart.health, "degraded");
  assert.equal(restart.expected_content_present, false);

  const rollback = JSON.parse((await fetchResponse("/ops/rollback", "POST")).body);
  assert.equal(rollback.version, "v1");
  assert.equal(rollback.health, "healthy");
  assert.equal(rollback.expected_content_present, true);

  const reset = JSON.parse((await fetchResponse("/demo/reset", "POST")).body);
  assert.equal(reset.version, "v1");
  assert.equal(reset.health, "healthy");
  assert.equal(reset.expected_content_present, true);
});
