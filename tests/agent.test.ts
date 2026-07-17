import assert from "node:assert/strict";
import test from "node:test";
import { runAgentCycle, testDeniedDeployCode } from "../lib/agent";
import { deployBroken, getSnapshot, resetDemo } from "../lib/store";

process.env.LOOPGUARD_USE_LOCAL_SIMULATOR = "true";

test("healthy polling remains monitoring", async () => {
  resetDemo();
  const snapshot = await runAgentCycle();
  assert.equal(snapshot.state, "MONITORING");
  assert.equal(snapshot.metrics.health, "healthy");
});

test("broken deployment is detected and resolved through restart then rollback", async () => {
  resetDemo();
  deployBroken();
  const snapshot = await runAgentCycle();

  assert.equal(snapshot.metrics.version, "v1");
  assert.equal(snapshot.metrics.health, "healthy");
  assert.equal(snapshot.state, "RESOLVED");
  assert.equal(snapshot.actionCounts.restart, 1);
  assert.equal(snapshot.actionCounts.rollback, 1);
  assert.match(
    snapshot.timeline.map((event) => event.title).join(" | "),
    /Restart will not be repeated/
  );
});

test("restricted deploy_code action is denied and escalated", async () => {
  resetDemo();
  const snapshot = await testDeniedDeployCode();

  assert.equal(snapshot.state, "ESCALATED");
  assert.equal(snapshot.authorizationDecision, "DENIED");
  assert.equal(getSnapshot().proposedAction, "deploy_code");
});
