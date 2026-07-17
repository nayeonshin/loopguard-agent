import type {
  ActionName,
  AgentSnapshot,
  AgentState,
  AuthorizationDecision,
  Deployment,
  EventStatus,
  EventType,
  Metrics,
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
  zeroPrimaryFailed: false
});

declare global {
  var loopguardStore: RuntimeStore | undefined;
}

function getStore() {
  globalThis.loopguardStore ??= initialStore();
  return globalThis.loopguardStore;
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
    actionCounts: store.actionCounts
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
  addEvent(
    "metric",
    "warning",
    "Broken deployment triggered",
    "Version v2 is active, error rate increased, and expected checkout content is missing.",
    store.metrics
  );
}

export function resetDemo() {
  globalThis.loopguardStore = initialStore();
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
