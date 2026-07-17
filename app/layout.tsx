import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import { theme as antdTheme } from "antd";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loopguard",
  description: "Autonomous on-call agent dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <ConfigProvider
            theme={{
              algorithm: antdTheme.defaultAlgorithm,
              token: {
                fontFamily:
                  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                colorPrimary: "#16784a",
                colorSuccess: "#16784a",
                colorError: "#b42318",
                colorWarning: "#b54708",
                colorInfo: "#175cd3",
                colorTextBase: "#172033",
                colorBgBase: "#ffffff",
                colorBgLayout: "#f6f7f3",
                colorBgContainer: "#ffffff",
                colorBorder: "#d9ded7",
                colorBorderSecondary: "#eef1ec",
                borderRadius: 8,
                controlHeight: 38,
              },
              components: {
                Layout: {
                  headerBg: "#111827",
                  headerColor: "#ffffff",
                  headerHeight: 64,
                  headerPadding: "0 28px",
                },
              },
            }}
          >
            {children}
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
