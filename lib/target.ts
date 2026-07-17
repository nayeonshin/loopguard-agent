import {
  addEvent,
  deployBroken as deployBrokenLocal,
  getRuntimeStore,
  resetDemo as resetDemoLocal,
  restartCurrentVersion as restartLocal,
  rollbackToHealthy as rollbackLocal
} from "./store";
import type { Deployment, Health, Metrics } from "./types";

const DEFAULT_TARGET_BASE_URL = "http://localhost:4000";

type RemoteDeployment = Partial<Deployment> & {
  at?: string;
  deployment_history?: unknown;
};

interface RemoteStatus extends Partial<Metrics> {
  deployment_history?: RemoteDeployment[];
  deployments?: RemoteDeployment[];
}

function targetBaseUrl() {
  return (process.env.LOOPGUARD_TARGET_BASE_URL || DEFAULT_TARGET_BASE_URL).replace(
    /\/$/,
    ""
  );
}

function isRemoteEnabled() {
  return process.env.LOOPGUARD_USE_LOCAL_SIMULATOR !== "true";
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!isRemoteEnabled()) {
    return null;
  }

  try {
    const response = await fetch(`${targetBaseUrl()}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(900)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizeDeployments(raw: RemoteDeployment[] | undefined): Deployment[] {
  return (raw ?? []).map((deployment) => ({
    version: deployment.version === "v2" ? "v2" : "v1",
    status: deployment.status ?? "unknown",
    created_at: deployment.created_at ?? deployment.at ?? new Date(0).toISOString(),
    at: deployment.at,
    notes: deployment.notes,
    type: deployment.type,
    deploymentId: deployment.deploymentId
  }));
}

export async function readTargetState() {
  const store = getRuntimeStore();
  const nexlaMetricsUrl = process.env.NEXLA_METRICS_URL;
  let nexlaMetrics: Metrics | null = null;

  if (nexlaMetricsUrl) {
    try {
      const headers: HeadersInit = {};
      if (process.env.NEXLA_SERVICE_KEY) {
        headers["Authorization"] = `Bearer ${process.env.NEXLA_SERVICE_KEY}`;
      }
      const response = await fetch(nexlaMetricsUrl, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(900)
      });

      if (response.ok) {
        const data = await response.json();
        const records = Array.isArray(data) ? data : data.records;
        const lastRecord = records[records.length - 1];
        nexlaMetrics = {
          version: lastRecord.version ?? store.metrics.version,
          health: lastRecord.health ?? lastRecord.status ?? store.metrics.health,
          error_rate: lastRecord.error_rate ?? store.metrics.error_rate,
          latency_ms: lastRecord.latency_ms ?? store.metrics.latency_ms,
          expected_content_present: lastRecord.expected_content_present ?? store.metrics.expected_content_present
        };
      }
    } catch {
      // Fall through to existing behavior
    }
  }

  if (nexlaMetrics) {
    return {
      metrics: nexlaMetrics,
      deployments: store.deployments,
      source: "nexla"
    };
  }

  const [health, metrics, deploymentsResponse] = await Promise.all([
    fetchJson<Health>("/health"),
    fetchJson<RemoteStatus>("/metrics"),
    fetchJson<RemoteStatus>("/deployments")
  ]);

  if (!health && !metrics && !deploymentsResponse) {
    return {
      metrics: store.metrics,
      deployments: store.deployments,
      source: "local-simulator" as const
    };
  }

  const nextMetrics: Metrics = {
    version: metrics?.version ?? health?.version ?? store.metrics.version,
    health: metrics?.health ?? health?.status ?? store.metrics.health,
    error_rate: metrics?.error_rate ?? store.metrics.error_rate,
    latency_ms: metrics?.latency_ms ?? store.metrics.latency_ms,
    expected_content_present:
      health?.expected_content_present ??
      metrics?.expected_content_present ??
      store.metrics.expected_content_present
  };

  const rawDeployments =
    deploymentsResponse?.deployments ??
    deploymentsResponse?.deployment_history ??
    metrics?.deployments ??
    metrics?.deployment_history;
  const deployments = normalizeDeployments(rawDeployments);

  store.metrics = nextMetrics;
  if (deployments.length > 0) {
    store.deployments = deployments;
  }

  return {
    metrics: store.metrics,
    deployments: store.deployments,
    source: targetBaseUrl()
  };
}

export async function triggerBrokenDeployment() {
  const remote = await fetchJson<RemoteStatus>("/demo/deploy-broken", {
    method: "POST"
  });

  if (!remote) {
    deployBrokenLocal();
    return readTargetState();
  } else {
    const store = getRuntimeStore();
    store.state = "MONITORING";
    store.hypothesis = "No active incident.";
    store.proposedAction = "none";
    store.authorizationDecision = "NONE";
    store.previousActionFailed = false;
    store.actionCounts = {};
    store.zeroPrimaryFailed = false;
  }

  const state = await readTargetState();
  addEvent(
    "metric",
    "warning",
    "Broken deployment triggered",
    "Remote backend switched to v2, error rate increased, and expected checkout content is missing.",
    state.metrics
  );
  return state;
}

export async function resetTarget() {
  resetDemoLocal();
  await fetchJson<RemoteStatus>("/demo/reset", {
    method: "POST"
  });

  return readTargetState();
}

export async function restartTarget() {
  const store = getRuntimeStore();
  const before = getRuntimeStore().metrics;
  const remote = await fetchJson<RemoteStatus>("/ops/restart", {
    method: "POST"
  });

  if (!remote) {
    return restartLocal();
  }

  const { metrics } = await readTargetState();
  store.actionCounts.restart = (store.actionCounts.restart ?? 0) + 1;
  store.previousActionFailed = !(
    metrics.health === "healthy" && metrics.error_rate < before.error_rate
  );
  return {
    ok: true,
    recovered: !store.previousActionFailed,
    metrics
  };
}

export async function rollbackTarget() {
  const store = getRuntimeStore();
  const remote = await fetchJson<RemoteStatus>("/ops/rollback", {
    method: "POST"
  });

  if (!remote) {
    return rollbackLocal();
  }

  const { metrics } = await readTargetState();
  store.actionCounts.rollback = (store.actionCounts.rollback ?? 0) + 1;
  store.previousActionFailed = !(
    metrics.health === "healthy" && metrics.expected_content_present
  );
  return {
    ok: true,
    recovered: !store.previousActionFailed,
    metrics
  };
}

export function getTargetBaseUrl() {
  return targetBaseUrl();
}
