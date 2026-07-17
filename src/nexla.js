const NEXLA_WEBHOOK_URL = process.env.NEXLA_WEBHOOK_URL || "";
const NEXLA_AUTH_HEADER = process.env.NEXLA_AUTH_HEADER || "";
const NEXLA_AUTH_TOKEN = process.env.NEXLA_AUTH_TOKEN || "";
const NEXLA_REQUIRED = process.env.NEXLA_REQUIRED !== "false";

let lastPublishResult = {
  ok: false,
  reason: NEXLA_WEBHOOK_URL ? "No Nexla events published yet" : "Nexla webhook not configured",
};

function buildHeaders() {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
  };

  if (NEXLA_AUTH_HEADER && NEXLA_AUTH_TOKEN) {
    headers[NEXLA_AUTH_HEADER] = NEXLA_AUTH_TOKEN;
  }

  return headers;
}

export function isNexlaConfigured() {
  return NEXLA_WEBHOOK_URL.length > 0;
}

export function isNexlaRequired() {
  return NEXLA_REQUIRED;
}

export function getNexlaStatus() {
  return {
    required: isNexlaRequired(),
    configured: isNexlaConfigured(),
    ready: isNexlaConfigured(),
    lastPublishResult,
  };
}

export async function publishNexlaEvent(event) {
  if (!isNexlaConfigured()) {
    lastPublishResult = {
      ok: false,
      reason: "Nexla webhook not configured",
    };
    return lastPublishResult;
  }

  try {
    const response = await fetch(NEXLA_WEBHOOK_URL, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      lastPublishResult = {
        ok: false,
        reason: `Nexla webhook responded with ${response.status}`,
      };
      return lastPublishResult;
    }

    lastPublishResult = {
      ok: true,
      status: response.status,
    };
    return lastPublishResult;
  } catch (error) {
    lastPublishResult = {
      ok: false,
      reason: error instanceof Error ? error.message : "Unknown Nexla error",
    };
    return lastPublishResult;
  }
}
