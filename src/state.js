const healthyState = {
  version: "v1",
  health: "healthy",
  errorRate: 0.01,
  latencyMs: 120,
  expectedContentPresent: true,
  deploymentId: 1,
};

const brokenState = {
  version: "v2",
  health: "degraded",
  errorRate: 0.42,
  latencyMs: 1850,
  expectedContentPresent: false,
  deploymentId: 2,
};

const baseState = () => ({
  ...healthyState,
  deploymentHistory: [
    {
      deploymentId: 1,
      version: "v1",
      type: "initial",
      status: "healthy",
      at: new Date(0).toISOString(),
    },
  ],
  lastAction: "reset",
});

export const state = baseState();

export function resetState() {
  const next = baseState();
  Object.assign(state, next);
}

export function deployBroken() {
  Object.assign(state, brokenState);
  state.deploymentHistory = [
    ...state.deploymentHistory,
    {
      deploymentId: state.deploymentId,
      version: state.version,
      type: "demo/deploy-broken",
      status: "broken",
      at: new Date().toISOString(),
    },
  ];
  state.lastAction = "deploy-broken";
}

export function restartCurrentVersion() {
  state.deploymentHistory = [
    ...state.deploymentHistory,
    {
      deploymentId: state.deploymentId,
      version: state.version,
      type: "ops/restart",
      status: state.health,
      at: new Date().toISOString(),
    },
  ];
  state.lastAction = "restart";
}

export function rollbackToHealthy() {
  const nextId = state.deploymentId + 1;
  Object.assign(state, {
    ...healthyState,
    deploymentId: nextId,
  });
  state.deploymentHistory = [
    ...state.deploymentHistory,
    {
      deploymentId: state.deploymentId,
      version: state.version,
      type: "ops/rollback",
      status: "healthy",
      at: new Date().toISOString(),
    },
  ];
  state.lastAction = "rollback";
}

export function metricsSnapshot() {
  return {
    version: state.version,
    health: state.health,
    error_rate: state.errorRate,
    latency_ms: state.latencyMs,
    expected_content_present: state.expectedContentPresent,
  };
}
