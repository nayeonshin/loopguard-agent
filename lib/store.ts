import type {
  ActionName,
  AgentSnapshot,
  AgentState,
  AuthorizationDecision,
  AutopilotStatus,
  Deployment,
  EventStatus,
  EventType,
  Metrics,
  SpendStatus,
  TimelineEvent
} from "./types";

interface RuntimeStore {
  metrics: Metrics;
  deployments: Deployment[];
  state: AgentState;
  hypothesis: string;
  proposedAction: ActionName | "none";
  authorizationDecision: AuthorizationDecision | "PENDING" | "NONE";
  timeline: TimelineEvent[];
  actionCounts: Partial<Record<ActionName, number>>;
  previousActionFailed: boolean;
  zeroPrimaryFailed: boolean;
  autopilot: AutopilotStatus;
  spendSessionUsd: number;
  spendIncidentUsd: number;
}

const startedAt = new Date();

const initialStore = (): RuntimeStore => ({
  metrics: {
    version: "v1",
    health: "healthy",
    error_rate: 0.011,
    latency_ms: 138,
    expected_content_present: true
  },
  deployments: [
    {
      version: "v1",
      status: "active",
      created_at: startedAt.toISOString(),
      notes: "Healthy baseline deployed"
    }
  ],
  state: "MONITORING",
  hypothesis: "No active incident.",
  proposedAction: "none",
  authorizationDecision: "NONE",
  timeline: [
    {
      timestamp: startedAt.toISOString(),
      type: "state",
      status: "success",
      title: "Monitoring healthy website",
      detail: "Loopguard is polling the built-in simulator for availability, latency, and expected content.",
      metadata: {
        version: "v1",
        error_rate: 0.011,
        latency_ms: 138
      }
    }
  ],
  actionCounts: {},
  previousActionFailed: false,
  zeroPrimaryFailed: false,
  autopilot: {
    enabled: false,
    dryRun: process.env.LOOPGUARD_DRY_RUN === "true",
    intervalSeconds: Number(process.env.LOOPGUARD_AUTOPILOT_INTERVAL_SECONDS || 15),
    cooldownUntil: null
  },
  spendSessionUsd: 0,
  spendIncidentUsd: 0
});

declare global {
  var loopguardStore: RuntimeStore | undefined;
}

function getStore() {
  globalThis.loopguardStore ??= initialStore();
  const store = globalThis.loopguardStore;
  // Backfill fields on stores created before they existed (survives HMR/deploys).
  store.autopilot ??= initialStore().autopilot;
  store.spendSessionUsd ??= 0;
  store.spendIncidentUsd ??= 0;
  return store;
}

export function addEvent(
  type: EventType,
  status: EventStatus,
  title: string,
  detail: string,
  metadata?: unknown
) {
  getStore().timeline.unshift({
    timestamp: new Date().toISOString(),
    type,
    status,
    title,
    detail,
    metadata
  });
}

export function setState(state: AgentState) {
  getStore().state = state;
  addEvent("state", "info", `Agent state: ${state}`, `Loopguard entered ${state}.`);
}

export function getSnapshot(): AgentSnapshot {
  const store = getStore();
  return {
    metrics: store.metrics,
    deployments: store.deployments,
    state: store.state,
    hypothesis: store.hypothesis,
    proposedAction: store.proposedAction,
    authorizationDecision: store.authorizationDecision,
    timeline: store.timeline,
    actionCounts: store.actionCounts,
    autopilot: { ...store.autopilot },
    spend: getSpendStatus()
  };
}

export function getRuntimeStore() {
  return getStore();
}

export function deployBroken() {
  const store = getStore();
  const createdAt = new Date().toISOString();

  store.deployments = store.deployments.map((deployment) => ({
    ...deployment,
    status: deployment.status === "active" ? "superseded" : deployment.status
  }));
  store.deployments.unshift({
    version: "v2",
    status: "active",
    created_at: createdAt,
    notes: "Broken demo deployment removed expected checkout content"
  });
  store.metrics = {
    version: "v2",
    health: "degraded",
    error_rate: 0.42,
    latency_ms: 1850,
    expected_content_present: false
  };
  store.state = "MONITORING";
  store.hypothesis = "No active incident.";
  store.proposedAction = "none";
  store.authorizationDecision = "NONE";
  store.previousActionFailed = false;
  store.actionCounts = {};
  store.zeroPrimaryFailed = false;
  resetIncidentSpend();
  addEvent(
    "metric",
    "warning",
    "Broken deployment triggered",
    "Version v2 is active, error rate increased, and expected checkout content is missing.",
    store.metrics
  );
}

export function resetDemo() {
  const oldStore = getStore();
  const newStore = initialStore();
  newStore.autopilot = oldStore.autopilot;
  newStore.spendSessionUsd = oldStore.spendSessionUsd;
  newStore.spendIncidentUsd = 0;
  globalThis.loopguardStore = newStore;
  addEvent("state", "success", "Demo reset", "Target returned to healthy v1.");
}

export function restartCurrentVersion() {
  const store = getStore();
  store.actionCounts.restart = (store.actionCounts.restart ?? 0) + 1;

  if (store.metrics.version === "v2") {
    store.previousActionFailed = true;
    addEvent(
      "action",
      "warning",
      "Restart completed without recovery",
      "Restarting v2 succeeded operationally, but the regression remains.",
      store.metrics
    );
    return {
      ok: true,
      recovered: false,
      metrics: store.metrics
    };
  }

  store.previousActionFailed = false;
  addEvent("action", "success", "Restart completed", "Healthy version restarted.");
  return {
    ok: true,
    recovered: true,
    metrics: store.metrics
  };
}

export function rollbackToHealthy() {
  const store = getStore();
  store.actionCounts.rollback = (store.actionCounts.rollback ?? 0) + 1;
  store.deployments = store.deployments.map((deployment) => ({
    ...deployment,
    status: deployment.version === "v1" ? "active" : "rolled_back"
  }));
  store.metrics = {
    version: "v1",
    health: "healthy",
    error_rate: 0.008,
    latency_ms: 124,
    expected_content_present: true
  };
  store.previousActionFailed = false;
  addEvent(
    "action",
    "success",
    "Rollback restored service",
    "Version v1 is active again and verification metrics are healthy.",
    store.metrics
  );
  return {
    ok: true,
    recovered: true,
    metrics: store.metrics
  };
}

export function recordSpend(usd: number) {
  const store = getStore();
  store.spendSessionUsd += usd;
  store.spendIncidentUsd += usd;
}

export function resetIncidentSpend() {
  const store = getStore();
  store.spendIncidentUsd = 0;
}

export function isBudgetExceeded(): boolean {
  const store = getStore();
  const sessionBudgetUsd = Number(process.env.LOOPGUARD_BUDGET_SESSION || 1);
  const incidentBudgetUsd = Number(process.env.LOOPGUARD_BUDGET_INCIDENT || 0.25);
  return store.spendSessionUsd >= sessionBudgetUsd || store.spendIncidentUsd >= incidentBudgetUsd;
}

export function getSpendStatus(): SpendStatus {
  const store = getStore();
  const sessionBudgetUsd = Number(process.env.LOOPGUARD_BUDGET_SESSION || 1);
  const incidentBudgetUsd = Number(process.env.LOOPGUARD_BUDGET_INCIDENT || 0.25);
  return {
    sessionUsd: store.spendSessionUsd,
    incidentUsd: store.spendIncidentUsd,
    sessionBudgetUsd,
    incidentBudgetUsd
  };
}
