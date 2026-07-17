import { authorizeWithPomerium, executeZeroTool } from "./adapters";
import { policyConfig } from "./policy";
import {
  addEvent,
  getRuntimeStore,
  getSnapshot,
  setState,
  resetIncidentSpend,
  isBudgetExceeded,
  getSpendStatus
} from "./store";
import { readTargetState, restartTarget, rollbackTarget } from "./target";
import { zeroCall } from "./zero";
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

async function planWithLLM(phase: "initial" | "replan"): Promise<{ hypothesis: string; action: ActionName } | null> {
  if (process.env.LOOPGUARD_ZERO_LIVE !== "true" || process.env.LOOPGUARD_LLM_PLANNING === "false") {
    return null;
  }

  const store = getRuntimeStore();
  const prompt = `Current metrics: ${JSON.stringify(store.metrics)}
  Newest deployment: ${JSON.stringify(newestDeployment())}
  Action counts: ${JSON.stringify(store.actionCounts)}
  Previous action failed: ${store.previousActionFailed}
  Phase: ${phase}
  Allowed actions: ["capture_screenshot","publish_status","notify_team","restart","rollback","deploy_code"]
  Policy rules (an action is DENIED unless its conditions hold; conditions reference the context above): ${JSON.stringify(policyConfig.actions)}
  You are the planner for an autonomous on-call agent. Diagnose the likely cause and pick the single best next action that the policy will ALLOW in the current context.
  Respond with STRICT JSON only, no other text: {"hypothesis": string, "proposed_action": <one allowed action>, "reasoning": string}`;

  try {
    const response = await zeroCall("qwen llm gateway", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000
    }, { limit: 3, maxPay: "0.05" });

    const body = response.body as {
      content?: string;
      choices?: { message?: { content?: string } }[];
    };
    const assistantText = body.content ?? body.choices?.[0]?.message?.content ?? "";
    const jsonBlock = assistantText.match(/\{[\s\S]*\}/);
    if (!jsonBlock) return null;

    const plan = JSON.parse(jsonBlock[0]) as {
      hypothesis?: string;
      proposed_action?: string;
      reasoning?: string;
    };
    if (
      typeof plan.hypothesis !== "string" ||
      !["capture_screenshot", "publish_status", "notify_team", "restart", "rollback", "deploy_code"].includes(plan.proposed_action ?? "")
    ) {
      return null;
    }

    const winner = response.attempts.find((attempt) => attempt.ok);
    addEvent("observation", "info", "LLM reasoning (Zero)", plan.reasoning ?? "", {
      hypothesis: plan.hypothesis,
      proposed_action: plan.proposed_action,
      provider: winner?.provider,
      runId: winner?.runId,
      paidUsd: winner?.paidUsd
    });

    return { hypothesis: plan.hypothesis, action: plan.proposed_action as ActionName };
  } catch (error) {
    return null;
  }
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

  if (getRuntimeStore().autopilot.dryRun) {
    addEvent("action", "info", "Dry-run: would execute " + action, "Dry-run mode is on, so no mutation or paid call was made.", { action });
    return { ok: true, recovered: false, metrics: getRuntimeStore().metrics };
  }

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

  const previousState = store.state;
  setState("DETECTING");
  if (previousState === "MONITORING" || previousState === "RESOLVED") {
    resetIncidentSpend();
  }
  if (isBudgetExceeded()) {
    addEvent("policy", "warning", "Zero budget exhausted", "Paid Zero calls are disabled until budgets reset; the loop continues with deterministic logic and free fallbacks.", getSpendStatus());
  }

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

  let plan = await planWithLLM("initial");
  let nextAction: ActionName;
  if (plan) {
    store.hypothesis = plan.hypothesis;
    nextAction = plan.action;
  } else {
    nextAction = proposeNextAction();
  }

  let decision = await authorize(nextAction);

  if (decision.decision === "DENIED" && plan && plan.action !== proposeNextAction()) {
    const fallbackAction = proposeNextAction();
    addEvent(
      "policy",
      "warning",
      "LLM plan denied, deterministic fallback armed",
      `${nextAction} was denied (${decision.reason}); retrying with ${fallbackAction}.`,
      { denied: nextAction, fallback: fallbackAction }
    );
    nextAction = fallbackAction;
    decision = await authorize(nextAction);
  }

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

  await independentProbe();

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

  plan = await planWithLLM("replan");
  if (plan) {
    store.hypothesis = plan.hypothesis;
    nextAction = plan.action;
  } else {
    nextAction = proposeNextAction();
  }

  decision = await authorize(nextAction);

  if (decision.decision === "DENIED" && plan && plan.action !== proposeNextAction()) {
    const fallbackAction = proposeNextAction();
    addEvent(
      "policy",
      "warning",
      "LLM plan denied, deterministic fallback armed",
      `${nextAction} was denied (${decision.reason}); retrying with ${fallbackAction}.`,
      { denied: nextAction, fallback: fallbackAction }
    );
    nextAction = fallbackAction;
    decision = await authorize(nextAction);
  }

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

  await independentProbe();

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

async function independentProbe() {
  if (
    process.env.LOOPGUARD_ZERO_LIVE === "true" &&
    process.env.LOOPGUARD_PROBE_URL
  ) {
    try {
      const response = await zeroCall("http uptime check url status", {
        url: process.env.LOOPGUARD_PROBE_URL,
        method: "GET"
      }, { limit: 3, maxPay: "0.03" });

      const body = response.body as {
        status?: number;
        results?: { status?: number }[];
      };
      const httpStatus = body?.results?.[0]?.status ?? body?.status;
      const statusOk =
        typeof httpStatus === "number" && httpStatus >= 200 && httpStatus < 400;
      const winner = response.attempts.find((attempt) => attempt.ok);
      addEvent(
        "verification",
        statusOk ? "success" : "warning",
        "Independent Zero probe",
        statusOk
          ? `External probe reached ${process.env.LOOPGUARD_PROBE_URL} with HTTP ${httpStatus}.`
          : `External probe did not confirm recovery (HTTP ${httpStatus ?? "unknown"}).`,
        {
          httpStatus,
          provider: winner?.provider,
          runId: winner?.runId,
          paidUsd: winner?.paidUsd
        }
      );
    } catch (error) {
      addEvent(
        "verification",
        "warning",
        "Independent Zero probe failed",
        error instanceof Error ? error.message : "Unknown probe error"
      );
    }
  }
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
