import { addEvent, getRuntimeStore, getSnapshot } from "./store";
import { runAgentCycle } from "./agent";
import type { AgentSnapshot } from "./types";

interface AutopilotRuntime {
  timer: NodeJS.Timeout | null;
  cycleInFlight: boolean;
}

declare global {
  var loopguardAutopilot: AutopilotRuntime | undefined;
}

function runtime(): AutopilotRuntime {
  globalThis.loopguardAutopilot ??= { timer: null, cycleInFlight: false };
  return globalThis.loopguardAutopilot;
}

function cooldownActive(): boolean {
  const until = getRuntimeStore().autopilot.cooldownUntil;
  return until !== null && new Date(until) > new Date();
}

async function tick() {
  const rt = runtime();
  if (rt.cycleInFlight || cooldownActive()) {
    return;
  }

  rt.cycleInFlight = true;
  try {
    const store = getRuntimeStore();
    if (store.autopilot.cooldownUntil) {
      store.autopilot.cooldownUntil = null;
    }

    const snapshot = await runAgentCycle();
    if (snapshot.state === "RESOLVED" || snapshot.state === "ESCALATED") {
      const cooldownSeconds = Number(process.env.LOOPGUARD_COOLDOWN_SECONDS || 60);
      store.autopilot.cooldownUntil = new Date(
        Date.now() + cooldownSeconds * 1000
      ).toISOString();
      addEvent(
        "state",
        "info",
        "Auto-pilot cooldown",
        `Incident ${snapshot.state.toLowerCase()}; auto-pilot pauses for ${cooldownSeconds}s before monitoring resumes.`
      );
    }
  } catch (error) {
    addEvent(
      "state",
      "warning",
      "Auto-pilot cycle error",
      error instanceof Error ? error.message : "Unknown auto-pilot error"
    );
  } finally {
    rt.cycleInFlight = false;
  }
}

function startTimer() {
  const rt = runtime();
  if (rt.timer) {
    return;
  }
  rt.timer = setInterval(() => {
    void tick();
  }, getRuntimeStore().autopilot.intervalSeconds * 1000);
}

function stopTimer() {
  const rt = runtime();
  if (rt.timer) {
    clearInterval(rt.timer);
    rt.timer = null;
  }
}

export function setAutopilot(opts: {
  enabled?: boolean;
  dryRun?: boolean;
}): AgentSnapshot {
  const store = getRuntimeStore();

  if (typeof opts.enabled === "boolean" && opts.enabled !== store.autopilot.enabled) {
    store.autopilot.enabled = opts.enabled;
    if (opts.enabled) {
      startTimer();
      addEvent(
        "state",
        "info",
        "Auto-pilot enabled",
        `Loopguard now monitors autonomously every ${store.autopilot.intervalSeconds}s.`
      );
    } else {
      stopTimer();
      addEvent("state", "info", "Auto-pilot disabled", "Manual control restored.");
    }
  }

  if (typeof opts.dryRun === "boolean" && opts.dryRun !== store.autopilot.dryRun) {
    store.autopilot.dryRun = opts.dryRun;
    addEvent(
      "state",
      "info",
      `Dry-run ${opts.dryRun ? "enabled" : "disabled"}`,
      opts.dryRun
        ? "The agent will detect, plan, and authorize but make no mutations or paid Zero calls."
        : "Actions and paid Zero calls are live again."
    );
  }

  return getSnapshot();
}
