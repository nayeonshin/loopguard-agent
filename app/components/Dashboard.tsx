"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Layout,
  Row,
  Space,
  Tag,
  Typography,
} from "antd";
import { PoweroffOutlined, RocketOutlined, WarningOutlined, SyncOutlined } from "@ant-design/icons";
import type { AgentSnapshot, TimelineEvent } from "@/lib/types";

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function statusColor(value: string) {
  if (["healthy", "RESOLVED", "ALLOWED", "success"].includes(value)) return "success";
  if (["degraded", "ESCALATED", "DENIED", "error"].includes(value)) return "error";
  if (["warning", "PENDING", "REPLANNING"].includes(value)) return "warning";
  if (value === "MONITORING") return "blue";
  return "purple";
}

function statusDotColor(status: TimelineEvent["status"]) {
  switch (status) {
    case "info":
      return "#175cd3";
    case "warning":
      return "#b54708";
    case "success":
      return "#16784a";
    case "error":
      return "#b42318";
    default:
      return "#98a2b3";
  }
}

function Sparkline({ data }: { data: number[] }) {
  return (
    <svg width="60" height="30" viewBox={`0 0 60 30`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d={`M0 30 ${data.map((value, index) => `L${index * 6} ${30 - (value * 30)}`).join(" ")}`}
        stroke="#16784a"
        strokeLinecap="round"
      />
    </svg>
  );
}

const cardStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: 12,
  border: "1px solid #e4e7e0",
  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)",
};

const cardBodyStyle: React.CSSProperties = { padding: "16px 20px" };

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        color: "#3f4a5c",
        fontSize: 12,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.6,
      }}
    >
      {children}
    </span>
  );
}

function CodeBlock({ value }: { value: unknown }) {
  return (
    <pre
      style={{
        margin: 0,
        background: "#f4f6f2",
        border: "1px solid #e4e7e0",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 12,
        lineHeight: 1.5,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        overflowX: "auto",
        maxWidth: "100%",
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function DashboardInner({ initialSnapshot }: { initialSnapshot: AgentSnapshot }) {
  const { notification } = App.useApp();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorRateHistory, setErrorRateHistory] = useState<number[]>([]);
  const [timelineClearedAt, setTimelineClearedAt] = useState<number | null>(null);
  const prevDecision = useRef(initialSnapshot.authorizationDecision);

  const visibleTimeline = timelineClearedAt
    ? snapshot.timeline.filter(
        (event) => new Date(event.timestamp).getTime() > timelineClearedAt
      )
    : snapshot.timeline;

  const websiteHealthy = snapshot.metrics.health === "healthy";

  useEffect(() => {
    if (
      snapshot.authorizationDecision === "DENIED" &&
      prevDecision.current !== "DENIED"
    ) {
      const detail = [...snapshot.timeline].find(
        (event) => event.type === "policy" && event.status === "error"
      )?.detail;
      notification.error({
        title: "Action denied by policy",
        description: `Pomerium denied "${snapshot.proposedAction}".${detail ? ` ${detail}` : ""}`,
        placement: "topRight",
        duration: 8,
      });
    }
    prevDecision.current = snapshot.authorizationDecision;
  }, [snapshot, notification]);

  async function post(url: string, action: string) {
    setBusyAction(action);
    try {
      const response = await fetch(url, { method: "POST" });
      setSnapshot(await response.json());
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    async function refreshSnapshot() {
      const response = await fetch("/api/agent");
      const newSnapshot = await response.json();
      setSnapshot(newSnapshot);
      setErrorRateHistory(prev => [...prev.slice(-5), newSnapshot.metrics.error_rate]);
    }

    void refreshSnapshot();
    const interval = window.setInterval(refreshSnapshot, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const controls = [
    {
      key: "break",
      label: "Break deployment",
      icon: <PoweroffOutlined />,
      props: { type: "primary" as const, danger: true },
      url: "/api/demo/deploy-broken",
    },
    {
      key: "agent",
      label: "Run agent cycle",
      icon: <RocketOutlined />,
      props: { type: "primary" as const },
      url: "/api/agent",
    },
    {
      key: "denied",
      label: "Test denied action",
      icon: <WarningOutlined />,
      props: { ghost: true },
      url: "/api/integrations/denied-action",
    },
    {
      key: "reset",
      label: "Reset demo",
      icon: <SyncOutlined />,
      props: { type: "text" as const, className: "lg-subtle-btn" },
      url: "/api/demo/reset",
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider width={230} style={{ background: "#111827" }}>
        <div style={{ padding: "24px 16px" }}>
          <Typography.Text
            style={{
              color: "rgba(255, 255, 255, 0.55)",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}
          >
            Controls
          </Typography.Text>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {controls.map((control) => (
              <Button
                key={control.key}
                block
                icon={control.icon}
                loading={busyAction === control.key}
                disabled={busyAction !== null && busyAction !== control.key}
                onClick={() => post(control.url, control.key)}
                style={{ justifyContent: "flex-start" }}
                {...control.props}
              >
                {control.label}
              </Button>
            ))}
          </div>
        </div>
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            background: "#111827",
            padding: "0 28px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Typography.Text strong style={{ color: "#ffffff", fontSize: 18, letterSpacing: 0.3 }}>
            Loopguard
          </Typography.Text>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Space orientation="vertical" size="large" style={{ width: "100%" }}>
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                Loopguard
              </Typography.Title>
              <Typography.Text style={{ color: "#4b5565" }}>
                Autonomous on-call response loop for breakable websites
              </Typography.Text>
            </div>

            {snapshot.state === "ESCALATED" ? (
              <Alert
                type="warning"
                showIcon
                closable
                title="Incident escalated to human on-call"
                description="Loopguard could not resolve the incident within policy limits and has notified the on-call team."
              />
            ) : null}

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} md={6}>
                <Card variant="borderless" style={cardStyle} styles={{ body: cardBodyStyle }}>
                  <CardLabel>Website status</CardLabel>
                  <div style={{ margin: "10px 0 6px" }}>
                    <Tag
                      color={statusColor(snapshot.metrics.health)}
                      style={{ fontSize: 14, padding: "4px 10px" }}
                    >
                      {snapshot.metrics.health}
                    </Tag>
                  </div>
                  <Typography.Text style={{ color: "#4b5565", fontSize: 12 }}>
                    {websiteHealthy ? "Serving traffic normally" : "Probe detected a failure"}
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card variant="borderless" style={cardStyle} styles={{ body: cardBodyStyle }}>
                  <CardLabel>Version</CardLabel>
                  <div style={{ margin: "8px 0 6px", fontSize: 24, fontWeight: 500 }}>
                    {snapshot.metrics.version}
                  </div>
                  <Typography.Text style={{ color: "#4b5565", fontSize: 12 }}>
                    Current deployment
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card variant="borderless" style={cardStyle} styles={{ body: cardBodyStyle }}>
                  <CardLabel>Error rate</CardLabel>
                  <div style={{ margin: "8px 0 6px", fontSize: 24, fontWeight: 500 }}>
                    {percent(snapshot.metrics.error_rate)}
                  </div>
                  <Sparkline data={errorRateHistory} />
                  <div>
                    <Typography.Text style={{ color: "#4b5565", fontSize: 12 }}>
                      Threshold: 20.0%
                    </Typography.Text>
                  </div>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card variant="borderless" style={cardStyle} styles={{ body: cardBodyStyle }}>
                  <CardLabel>Latency</CardLabel>
                  <div style={{ margin: "8px 0 6px", fontSize: 24, fontWeight: 500 }}>
                    {snapshot.metrics.latency_ms}ms
                  </div>
                  <Typography.Text style={{ color: "#4b5565", fontSize: 12 }}>
                    Expected content: {snapshot.metrics.expected_content_present ? "present" : "missing"}
                  </Typography.Text>
                </Card>
              </Col>
            </Row>

            <Card
              title="Agent Control Plane"
              variant="borderless"
              style={cardStyle}
              styles={{ body: cardBodyStyle }}
            >
              <Descriptions column={1} layout="horizontal" colon={false}>
                <Descriptions.Item label="Agent state">
                  <Tag color={statusColor(snapshot.state)}>{snapshot.state}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Hypothesis">
                  {snapshot.hypothesis}
                </Descriptions.Item>
                <Descriptions.Item label="Proposed action">
                  {snapshot.proposedAction}
                </Descriptions.Item>
                <Descriptions.Item label="Authorization decision">
                  <Tag color={statusColor(snapshot.authorizationDecision)}>
                    {snapshot.authorizationDecision}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Action attempts">
                  <CodeBlock value={snapshot.actionCounts} />
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card
              title="Incident Timeline"
              variant="borderless"
              style={cardStyle}
              styles={{ body: { ...cardBodyStyle, paddingTop: 4, paddingBottom: 4 } }}
              extra={
                <Button
                  size="small"
                  disabled={visibleTimeline.length === 0}
                  onClick={() => {
                    const latest = Math.max(
                      ...snapshot.timeline.map((event) =>
                        new Date(event.timestamp).getTime()
                      )
                    );
                    setTimelineClearedAt(latest);
                  }}
                >
                  Clear timeline
                </Button>
              }
            >
              {visibleTimeline.length === 0 ? (
                <Typography.Text style={{ color: "#4b5565", display: "block", padding: "12px 0" }}>
                  No events yet. New agent activity will appear here.
                </Typography.Text>
              ) : (
                visibleTimeline.map((event, index) => (
                  <div
                    key={`${event.timestamp}-${event.title}-${index}`}
                    style={{
                      display: "flex",
                      gap: 16,
                      padding: "12px 0",
                      borderBottom:
                        index === visibleTimeline.length - 1
                          ? "none"
                          : "1px solid #eef1ec",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        alignSelf: "flex-start",
                        gap: 8,
                        flex: "0 0 auto",
                        width: 110,
                        paddingTop: 3,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: statusDotColor(event.status),
                          flex: "0 0 auto",
                        }}
                      />
                      <Typography.Text
                        style={{
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                          fontSize: 12,
                          color: "#4b5565",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </Typography.Text>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <Typography.Text strong>{event.title}</Typography.Text>
                        <Tag color={statusColor(event.status)} style={{ marginInlineEnd: 0 }}>
                          {event.type}
                        </Tag>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        <Typography.Text style={{ color: "#4b5565" }}>
                          {event.detail}
                        </Typography.Text>
                      </div>
                      {event.metadata ? (
                        <div style={{ marginTop: 8 }}>
                          <CodeBlock value={event.metadata} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </Card>
          </Space>
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

export function Dashboard({ initialSnapshot }: { initialSnapshot: AgentSnapshot }) {
  return (
    <App>
      <DashboardInner initialSnapshot={initialSnapshot} />
    </App>
  );
}
