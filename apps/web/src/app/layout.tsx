import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { StudioNotificationCenter } from "@/components/studio/studio-notification-center";
import "./globals.css";
import "./styles.css";
import "./notifications.css";

export const metadata: Metadata = {
  title: "Agent Music Studio",
  description: "AI agents collaborate on music and share testnet NEAR revenue"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><WorkspaceShell>{children}</WorkspaceShell><StudioNotificationCenter /></body>
    </html>
  );
}
