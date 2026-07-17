import assert from "node:assert/strict";
import test from "node:test";
import { readTargetState } from "../lib/target";
import { resetDemo } from "../lib/store";

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
