import { getNexlaStatus, isNexlaConfigured, publishNexlaEvent } from "./nexla.js";
import { metricsSnapshot, state, stateSnapshot } from "./state.js";

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
      enabled: isNexlaConfigured(),
      sendProbe: async (eventType = "probe") =>
        publishNexlaEvent({
          event_type: eventType,
          emitted_at: new Date().toISOString(),
          ...stateSnapshot(),
        }),
    },
    akash: {
      enabled: false,
      deploy: async () => ({ ok: false, reason: "Akash not configured" }),
    },
    describe() {
      const nexlaStatus = getNexlaStatus();
      return {
        currentVersion: state.version,
        probeSource: "local",
        nexlaEnabled: isNexlaConfigured(),
        nexlaRequired: nexlaStatus.required,
        nexlaConfigured: nexlaStatus.configured,
        nexlaReady: nexlaStatus.ready,
        nexlaLastPublish: nexlaStatus.lastPublishResult,
        akashEnabled: false,
      };
    },
  };
}
