import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import "./globals.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "RoyaltyDesk",
  description: "Evidence-backed recording royalty administration on NEAR"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><WorkspaceShell>{children}</WorkspaceShell></body>
    </html>
  );
}
