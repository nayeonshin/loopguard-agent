import type {
  ActionName,
  PolicyConfig,
  PolicyContext,
  PolicyResult
} from "./types";

export const policyConfig: PolicyConfig = {
  actions: {
    capture_screenshot: {
      autonomy: "allowed"
    },
    publish_status: {
      autonomy: "allowed"
    },
    notify_team: {
      autonomy: "allowed"
    },
    restart: {
      autonomy: "allowed",
      max_attempts: 1
    },
    rollback: {
      autonomy: "conditional",
      conditions: {
        error_rate_above: 0.2,
        recent_deployment_within_minutes: 10,
        previous_action_failed: true
      }
    },
    deploy_code: {
      autonomy: "prohibited"
    }
  },
  limits: {
    maximum_actions_per_incident: 4,
    verification_window_seconds: 10
  }
};

export function evaluatePolicy(
  action: ActionName,
  context: PolicyContext,
  config = policyConfig
): PolicyResult {
  const rule = config.actions[action];

  if (context.totalActions >= config.limits.maximum_actions_per_incident) {
    return {
      action,
      decision: "DENIED",
      reason: `Incident action limit of ${config.limits.maximum_actions_per_incident} reached`
    };
  }

  if (rule.autonomy === "prohibited") {
    return {
      action,
      decision: "DENIED",
      reason: `${action} is prohibited by policy`
    };
  }

  if (rule.max_attempts !== undefined) {
    const attempts = context.actionCounts[action] ?? 0;
    if (attempts >= rule.max_attempts) {
      return {
        action,
        decision: "DENIED",
        reason: `${action} already reached max attempts (${rule.max_attempts})`
      };
    }
  }

  if (rule.autonomy === "conditional") {
    const conditions = rule.conditions ?? {};

    if (
      conditions.error_rate_above !== undefined &&
      context.metrics.error_rate <= conditions.error_rate_above
    ) {
      return {
        action,
        decision: "DENIED",
        reason: `Error rate must be above ${conditions.error_rate_above}`
      };
    }

    if (
      conditions.previous_action_failed === true &&
      !context.previousActionFailed
    ) {
      return {
        action,
        decision: "DENIED",
        reason: "A previous action must have failed first"
      };
    }

    if (conditions.recent_deployment_within_minutes !== undefined) {
      const recent = context.deployments.some((deployment) => {
        const ageMs =
          context.now.getTime() - new Date(deployment.created_at).getTime();
        return ageMs <= conditions.recent_deployment_within_minutes! * 60_000;
      });

      if (!recent) {
        return {
          action,
          decision: "DENIED",
          reason: `No deployment found within ${conditions.recent_deployment_within_minutes} minutes`
        };
      }
    }
  }

  return {
    action,
    decision: "ALLOWED",
    reason: `${action} satisfies local autonomy policy`
  };
}
