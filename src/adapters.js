import { metricsSnapshot, state } from "./state.js";

export function createLocalProbeStream() {
  return {
    read() {
      return {
        observed_at: new Date().toISOString(),
        ...metricsSnapshot(),
      };
    },
  };
}

export function createIntegrationAdapters() {
  return {
    probeStream: createLocalProbeStream(),
    nexla: {
      enabled: false,
      sendProbe: async () => ({ ok: false, reason: "Nexla not configured" }),
    },
    akash: {
      enabled: false,
      deploy: async () => ({ ok: false, reason: "Akash not configured" }),
    },
    describe() {
      return {
        currentVersion: state.version,
        probeSource: "local",
        nexlaEnabled: false,
        akashEnabled: false,
      };
    },
  };
}
