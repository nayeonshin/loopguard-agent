import { authorizeWithPomerium, executeZeroTool } from "./adapters";
import { policyConfig } from "./policy";
import {
  addEvent,
  getRuntimeStore,
  getSnapshot,
  setState
} from "./store";
import { readTargetState, restartTarget, rollbackTarget } from "./target";
import type { ActionName, AgentSnapshot, PolicyContext } from "./types";

function buildPolicyContext(): PolicyContext {
  const store = getRuntimeStore();

  return {
    actionCounts: store.actionCounts,
    metrics: store.metrics,
    deployments: store.deployments,
    previousActionFailed: store.previousActionFailed,
    totalActions: Object.values(store.actionCounts).reduce(
      (sum, count) => sum + (count ?? 0),
      0
    ),
    now: new Date()
  };
}

function proposeNextAction(): ActionName {
  const store = getRuntimeStore();

  if ((store.actionCounts.restart ?? 0) === 0) {
    return "restart";
  }

  return "rollback";
}

function newestDeployment() {
  const store = getRuntimeStore();

  return [...store.deployments].sort(
    (left, right) =>
      new Date(right.created_at ?? right.at ?? 0).getTime() -
      new Date(left.created_at ?? left.at ?? 0).getTime()
  )[0];
}

async function authorize(action: ActionName) {
  const store = getRuntimeStore();
  store.proposedAction = action;
  store.authorizationDecision = "PENDING";
  setState("AUTHORIZING");
  const decision = await authorizeWithPomerium(action, buildPolicyContext());
  store.authorizationDecision = decision.decision;
  return decision;
}

async function act(action: ActionName) {
  setState("ACTING");

  if (action === "restart") {
    return restartTarget();
  }

  if (action === "rollback") {
    return rollbackTarget();
  }

  await executeZeroTool(action);
  return {
    ok: true,
    recovered: false,
    metrics: getRuntimeStore().metrics
  };
}

export async function runAgentCycle(): Promise<AgentSnapshot> {
  await readTargetState();
  const store = getRuntimeStore();

  if (store.metrics.health === "healthy") {
    store.state = "MONITORING";
    store.hypothesis = "No active incident.";
    addEvent(
      "metric",
      "success",
      "Website remains healthy",
      "Current probes show normal error rate, latency, and expected content.",
      store.metrics
    );
    return getSnapshot();
  }

  setState("DETECTING");
  addEvent(
    "metric",
    "warning",
    "Website regression detected",
    `Error rate increased to ${(store.metrics.error_rate * 100).toFixed(1)}% and expected content is missing.`,
    store.metrics
  );

  setState("INVESTIGATING");
  const recentDeployment = newestDeployment();
  store.hypothesis = `Recent deployment ${recentDeployment.version} likely caused the checkout regression.`;
  addEvent(
    "observation",
    "warning",
    "Likely cause identified",
    store.hypothesis,
    { deployment: recentDeployment }
  );

  setState("PLANNING");
  await executeZeroTool("capture_screenshot");

  let nextAction = proposeNextAction();
  let decision = await authorize(nextAction);

  if (decision.decision === "DENIED") {
    store.state = "ESCALATED";
    addEvent(
      "policy",
      "error",
      "Incident escalated",
      `${nextAction} was denied: ${decision.reason}`,
      { action: nextAction }
    );
    return getSnapshot();
  }

  let result = await act(nextAction);
  setState("VERIFYING");
  addEvent(
    "verification",
    result.recovered ? "success" : "warning",
    result.recovered ? "Verification passed" : "Verification found no recovery",
    result.recovered
      ? "Website returned to healthy service."
      : `Metrics are still degraded after ${nextAction}.`,
    result.metrics
  );

  if (result.recovered) {
    store.state = "RESOLVED";
    store.proposedAction = "none";
    addEvent("state", "success", "Incident resolved", "Loopguard verified recovery.");
    return getSnapshot();
  }

  setState("REPLANNING");
  addEvent(
    "action",
    "warning",
    "Restart will not be repeated",
    "Policy max_attempts prevents repeating the failed restart.",
    { max_attempts: policyConfig.actions.restart.max_attempts }
  );

  nextAction = proposeNextAction();
  decision = await authorize(nextAction);

  if (decision.decision === "DENIED") {
    store.state = "ESCALATED";
    addEvent(
      "policy",
      "error",
      "Incident escalated",
      `${nextAction} was denied: ${decision.reason}`,
      { action: nextAction }
    );
    return getSnapshot();
  }

  result = await act(nextAction);
  setState("VERIFYING");
  addEvent(
    "verification",
    result.recovered ? "success" : "error",
    result.recovered ? "Rollback verified" : "Rollback failed verification",
    result.recovered
      ? "Healthy v1 is active and metrics recovered."
      : "The site is still unhealthy after rollback.",
    result.metrics
  );

  store.state = result.recovered ? "RESOLVED" : "ESCALATED";
  store.proposedAction = result.recovered ? "none" : nextAction;
  addEvent(
    "state",
    result.recovered ? "success" : "error",
    result.recovered ? "Incident resolved" : "Incident escalated",
    result.recovered
      ? "Loopguard autonomously recovered the demo service."
      : "Loopguard could not recover within policy limits."
  );

  return getSnapshot();
}

export async function testDeniedDeployCode(): Promise<AgentSnapshot> {
  const store = getRuntimeStore();
  store.proposedAction = "deploy_code";
  store.authorizationDecision = "PENDING";
  setState("AUTHORIZING");
  const decision = await authorizeWithPomerium(
    "deploy_code",
    buildPolicyContext()
  );
  store.authorizationDecision = decision.decision;
  store.state = "ESCALATED";
  addEvent(
    "policy",
    "error",
    "Restricted production action denied",
    "deploy_code was denied by Pomerium policy and escalated to a human.",
    { decision }
  );
  return getSnapshot();
}
