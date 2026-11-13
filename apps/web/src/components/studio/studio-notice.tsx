import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Clock3, Info, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type StudioNoticeTone = "progress" | "success" | "warning" | "error" | "info";

export interface StudioNoticeData {
  readonly tone: StudioNoticeTone;
  readonly title: string;
  readonly description: string;
}

const icons = {
  progress: Clock3,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
  info: Info
} as const;

export function StudioNotice({ notice, children, className = "" }: { readonly notice: StudioNoticeData; readonly children?: ReactNode; readonly className?: string }) {
  const Icon = icons[notice.tone];
  return <Alert role={notice.tone === "error" || notice.tone === "warning" ? "alert" : "status"} aria-live={notice.tone === "error" || notice.tone === "warning" ? "assertive" : "polite"} className={`studio-notice-card studio-notice-${notice.tone} ${className}`}>
    <Icon aria-hidden="true" />
    <AlertTitle>{notice.title}</AlertTitle>
    <AlertDescription>{notice.description}{children}</AlertDescription>
  </Alert>;
}
