import type { ReactNode } from "react";
import { ReleaseProvider } from "@/components/release/release-context";
import { ReleaseWorkspace } from "@/components/release/release-workspace";

export default async function ReleaseLayout({ children, params }: Readonly<{ children: ReactNode; params: Promise<{ releaseId: string }> }>) {
  const { releaseId } = await params;
  return <ReleaseProvider releaseId={releaseId}><ReleaseWorkspace>{children}</ReleaseWorkspace></ReleaseProvider>;
}
