export type AgentState =
  | "MONITORING"
  | "DETECTING"
  | "INVESTIGATING"
  | "PLANNING"
  | "AUTHORIZING"
  | "ACTING"
  | "VERIFYING"
  | "REPLANNING"
  | "RESOLVED"
  | "ESCALATED";

export type SiteStatus = "healthy" | "warning" | "degraded";

export type EventStatus = "info" | "warning" | "success" | "error";

export type EventType =
  | "metric"
  | "observation"
  | "policy"
  | "action"
  | "verification"
  | "tool"
  | "state";

export type ActionName =
  | "capture_screenshot"
  | "publish_status"
  | "notify_team"
  | "restart"
  | "rollback"
  | "deploy_code";

export type Autonomy = "allowed" | "conditional" | "prohibited";

export type AuthorizationDecision = "ALLOWED" | "DENIED";

export interface Metrics {
  version: "v1" | "v2";
  health: SiteStatus;
  error_rate: number;
  latency_ms: number;
  expected_content_present: boolean;
}

export interface Health {
  status: SiteStatus;
  version: Metrics["version"];
  expected_content_present: boolean;
}

export interface Deployment {
  version: Metrics["version"];
  status: string;
  created_at: string;
  at?: string;
  notes?: string;
  type?: string;
  deploymentId?: number;
}

export interface TimelineEvent {
  timestamp: string;
  type: EventType;
  status: EventStatus;
  title: string;
  detail: string;
  metadata?: unknown;
}

export interface PolicyRule {
  autonomy: Autonomy;
  max_attempts?: number;
  conditions?: {
    error_rate_above?: number;
    recent_deployment_within_minutes?: number;
    previous_action_failed?: boolean;
  };
}

export interface PolicyConfig {
  actions: Record<ActionName, PolicyRule>;
  limits: {
    maximum_actions_per_incident: number;
    verification_window_seconds: number;
  };
}

export interface PolicyContext {
  actionCounts: Partial<Record<ActionName, number>>;
  metrics: Metrics;
  deployments: Deployment[];
  previousActionFailed: boolean;
  totalActions: number;
  now: Date;
}

export interface PolicyResult {
  action: ActionName;
  decision: AuthorizationDecision;
  reason: string;
}

export interface ToolResult {
  action: ActionName;
  ok: boolean;
  provider: string;
  detail: string;
  artifactUrl?: string;
}

export interface AgentSnapshot {
  metrics: Metrics;
  deployments: Deployment[];
  state: AgentState;
  hypothesis: string;
  proposedAction: ActionName | "none";
  authorizationDecision: AuthorizationDecision | "PENDING" | "NONE";
  timeline: TimelineEvent[];
  actionCounts: Partial<Record<ActionName, number>>;
}
