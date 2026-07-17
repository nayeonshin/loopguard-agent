"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  Col,
  Descriptions,
  Layout,
  Menu,
  Row,
  Space,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { SearchOutlined, BellOutlined, UserOutlined, PoweroffOutlined, RocketOutlined, WarningOutlined, SyncOutlined } from "@ant-design/icons";
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

function timelineColor(status: TimelineEvent["status"]) {
  switch (status) {
    case "info":
      return "blue";
    case "warning":
      return "orange";
    case "success":
      return "green";
    case "error":
      return "red";
    default:
      return "gray";
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

export function Dashboard({ initialSnapshot }: { initialSnapshot: AgentSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorRateHistory, setErrorRateHistory] = useState<number[]>([]);

  const finalStatus = useMemo(() => {
    if (snapshot.state === "RESOLVED") {
      return "Recovered";
    }
    if (snapshot.state === "ESCALATED") {
      return "Escalated";
    }
    return "Watching";
  }, [snapshot.state]);

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

  return (
    <Layout style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <Layout.Sider collapsible collapsed={false} style={{ background: "#111827", color: "#ffffff" }}>
        <div style={{ height: "100%" }}>
          <Typography.Text style={{ fontSize: 24, textAlign: "center", margin: "16px 0", color: "#ffffff" }}>
            Loopguard
          </Typography.Text>
          <Menu mode="inline" style={{ borderRight: 0 }} items={[
            {
              key: "break",
              icon: <PoweroffOutlined style={{ color: "#ff4d4f" }} />,
              danger: true,
              onClick: () => post("/api/demo/deploy-broken", "break"),
              disabled: busyAction !== null,
              label: "Break deployment"
            },
            {
              key: "agent",
              icon: <RocketOutlined />,
              onClick: () => post("/api/agent", "agent"),
              disabled: busyAction !== null,
              label: "Run agent cycle"
            },
            {
              key: "denied",
              icon: <WarningOutlined />,
              onClick: () => post("/api/integrations/denied-action", "denied"),
              disabled: busyAction !== null,
              label: "Test denied action"
            },
            {
              key: "reset",
              icon: <SyncOutlined />,
              onClick: () => post("/api/demo/reset", "reset"),
              disabled: busyAction !== null,
              label: "Reset demo"
            }
          ]} />
        </div>
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: "#111827", padding: "0 28px" }}>
          <Space orientation="horizontal" size="middle">
            <Typography.Text style={{ color: "#ffffff" }}>Loopguard</Typography.Text>
            <Typography.Text type="secondary" style={{ color: "#ffffff" }}>
              Autonomous on-call response loop for breakable websites
            </Typography.Text>
            <SearchOutlined style={{ color: "#ffffff", fontSize: 18 }} />
            <Space size="middle">
              <BellOutlined style={{ color: "#ffffff", fontSize: 18 }} />
              <UserOutlined style={{ color: "#ffffff", fontSize: 18 }} />
            </Space>
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: 24, maxWidth: 1200, margin: "0 auto", background: "#ffffff" }}>
          <Space orientation="vertical" size="large" style={{ width: "100%" }}>
            <Row justify="space-between" align="top" gutter={[16, 16]}>
              <Col>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  Loopguard
                </Typography.Title>
                <Typography.Text type="secondary">
                  Autonomous on-call response loop for breakable websites
                </Typography.Text>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} md={6}>
                <Card variant="borderless">
                  <Typography.Text type="secondary">Website status</Typography.Text>
                  <div style={{ margin: "8px 0" }}>
                    <Tag color={statusColor(snapshot.metrics.health)} style={{ fontSize: 14, padding: "4px 8px" }}>
                      {snapshot.metrics.health}
                    </Tag>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {finalStatus}
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card variant="borderless">
                  <Typography.Text type="secondary">Version</Typography.Text>
                  <div style={{ margin: "8px 0", fontSize: 24, fontWeight: 500 }}>
                    {snapshot.metrics.version}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Current deployment
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card variant="borderless">
                  <Typography.Text type="secondary">Error rate</Typography.Text>
                  <div style={{ margin: "8px 0", fontSize: 24, fontWeight: 500 }}>
                    {percent(snapshot.metrics.error_rate)}
                  </div>
                  <Sparkline data={errorRateHistory} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Threshold: 20.0%
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card variant="borderless">
                  <Typography.Text type="secondary">Latency</Typography.Text>
                  <div style={{ margin: "8px 0", fontSize: 24, fontWeight: 500 }}>
                    {snapshot.metrics.latency_ms}ms
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Expected content: {snapshot.metrics.expected_content_present ? "present" : "missing"}
                  </Typography.Text>
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card title="Agent Control Plane" variant="borderless">
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
                      <pre style={{ margin: 0, background: "#fafafa", padding: 8, borderRadius: 4, fontSize: 12 }}>
                        {JSON.stringify(snapshot.actionCounts, null, 2)}
                      </pre>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>

              <Col xs={24} lg={12}>
                <Card title="Incident Timeline" variant="borderless">
                  <Timeline items={snapshot.timeline.map((event) => ({
                    key: `${event.timestamp}-${event.title}-${event.detail}`,
                    title: new Date(event.timestamp).toLocaleTimeString(),
                    color: timelineColor(event.status),
                    content: (
                      <Space orientation="vertical" size="small">
                        <Space size="middle">
                          <Typography.Text strong>{event.title}</Typography.Text>
                          <Tag color={statusColor(event.status)}>{event.type}</Tag>
                        </Space>
                        <Typography.Text type="secondary">{event.detail}</Typography.Text>
                        {event.metadata ? (
                          <pre style={{ margin: 0, background: "#fafafa", padding: 8, borderRadius: 4, fontSize: 12 }}>
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        ) : null}
                      </Space>
                    )
                  }))} mode="start" />
                </Card>
              </Col>
            </Row>
          </Space>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
