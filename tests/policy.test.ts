import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePolicy } from "../lib/policy";
import type { PolicyContext } from "../lib/types";

function context(overrides: Partial<PolicyContext> = {}): PolicyContext {
  const now = new Date();
  return {
    actionCounts: {},
    metrics: {
      version: "v2",
      health: "degraded",
      error_rate: 0.42,
      latency_ms: 1850,
      expected_content_present: false
    },
    deployments: [
      {
        version: "v2",
        status: "active",
        created_at: now.toISOString(),
        notes: "Broken deployment"
      }
    ],
    previousActionFailed: true,
    totalActions: 0,
    now,
    ...overrides
  };
}

test("restart is allowed once", () => {
  const result = evaluatePolicy("restart", context());
  assert.equal(result.decision, "ALLOWED");
});

test("restart is denied after max attempts", () => {
  const result = evaluatePolicy("restart", context({ actionCounts: { restart: 1 } }));
  assert.equal(result.decision, "DENIED");
});

test("rollback is allowed when all conditions match", () => {
  const result = evaluatePolicy("rollback", context());
  assert.equal(result.decision, "ALLOWED");
});

test("rollback is denied without previous failed action", () => {
  const result = evaluatePolicy(
    "rollback",
    context({ previousActionFailed: false })
  );
  assert.equal(result.decision, "DENIED");
});

test("deploy_code is denied", () => {
  const result = evaluatePolicy("deploy_code", context());
  assert.equal(result.decision, "DENIED");
});
