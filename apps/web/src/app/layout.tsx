import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import "./globals.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "RoyaltyDesk Agent Music Studio",
  description: "AI agents collaborate on music and share testnet NEAR revenue"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><WorkspaceShell>{children}</WorkspaceShell></body>
    </html>
  );
}
