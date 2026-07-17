import { addEvent, getRuntimeStore } from "./store";
import type { ActionName, PolicyContext, PolicyResult, ToolResult } from "./types";
import { evaluatePolicy } from "./policy";

export async function authorizeWithPomerium(
  action: ActionName,
  context: PolicyContext
): Promise<PolicyResult> {
  const realEndpoint = process.env.POMERIUM_AUTHORIZE_URL;

  if (realEndpoint) {
    try {
      const response = await fetch(realEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.POMERIUM_TOKEN
            ? { authorization: `Pomerium ${process.env.POMERIUM_TOKEN}` }
            : {})
        },
        body: JSON.stringify({ action, context })
      });

      if (response.ok) {
        const result = (await response.json()) as PolicyResult;
        addEvent(
          "policy",
          result.decision === "ALLOWED" ? "success" : "error",
          `Pomerium ${result.decision}: ${action}`,
          result.reason,
          { provider: "pomerium", action }
        );
        return result;
      }
    } catch (error) {
      addEvent(
        "policy",
        "warning",
        "Pomerium adapter fell back to local policy",
        error instanceof Error ? error.message : "Unknown Pomerium error",
        { action }
      );
    }
  }

  const localDecision = evaluatePolicy(action, context);
  addEvent(
    "policy",
    localDecision.decision === "ALLOWED" ? "success" : "error",
    `Pomerium demo ${localDecision.decision}: ${action}`,
    localDecision.reason,
    { provider: "local-pomerium-adapter", action }
  );
  return localDecision;
}

export async function executeZeroTool(action: ActionName): Promise<ToolResult> {
  const realEndpoint = process.env.ZERO_TOOL_URL;

  if (realEndpoint) {
    try {
      const response = await fetch(realEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.ZERO_API_KEY
            ? { authorization: `Bearer ${process.env.ZERO_API_KEY}` }
            : {})
        },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        const result = (await response.json()) as ToolResult;
        addEvent(
          "tool",
          result.ok ? "success" : "warning",
          `Zero tool ${result.ok ? "succeeded" : "failed"}`,
          result.detail,
          { provider: result.provider, action }
        );
        return result;
      }
    } catch (error) {
      addEvent(
        "tool",
        "warning",
        "Zero adapter fell back to local tools",
        error instanceof Error ? error.message : "Unknown Zero error",
        { action }
      );
    }
  }

  const store = getRuntimeStore();

  if ((action === "capture_screenshot" || action === "publish_status") && !store.zeroPrimaryFailed) {
    store.zeroPrimaryFailed = true;
    addEvent(
      "tool",
      "warning",
      "Zero primary service failed",
      "The first discovered service timed out, so Loopguard will choose a fallback capability.",
      { provider: "zero-primary-demo", action }
    );
    const fallback: ToolResult = {
      action,
      ok: true,
      provider: "zero-fallback-demo",
      detail: "Fallback service captured evidence successfully.",
      artifactUrl: "/evidence/checkout-regression.png"
    };
    addEvent("tool", "success", "Zero fallback service succeeded", fallback.detail, {
      provider: fallback.provider,
      action
    });
    return fallback;
  }

  const result: ToolResult = {
    action,
    ok: true,
    provider: "zero-demo",
    detail: `${action} completed through the local Zero adapter.`
  };
  addEvent("tool", "success", "Zero tool succeeded", result.detail, {
    provider: result.provider,
    action
  });
  return result;
}
