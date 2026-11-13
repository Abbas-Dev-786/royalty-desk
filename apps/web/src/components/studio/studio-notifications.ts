import type { StudioNoticeData } from "./studio-notice";

export interface StudioNotification extends StudioNoticeData {
  readonly id?: string;
}

const eventName = "studio-notification";
const flashKey = "studio-flash-notification";

export function notifyStudio(notification: StudioNotification): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<StudioNotification>(eventName, { detail: notification }));
}

export function flashStudioNotification(notification: StudioNotification): boolean {
  if (typeof window === "undefined") return false;
  try { sessionStorage.setItem(flashKey, JSON.stringify(notification)); return true; }
  catch { return false; }
}

export function consumeFlashNotification(): StudioNotification | null {
  if (typeof window === "undefined") return null;
  let saved: string | null;
  try { saved = sessionStorage.getItem(flashKey); sessionStorage.removeItem(flashKey); }
  catch { return null; }
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as StudioNotification;
    if (typeof parsed.title !== "string" || typeof parsed.description !== "string" || !["progress", "success", "warning", "error", "info"].includes(parsed.tone)) return null;
    return parsed;
  } catch { return null; }
}

export { eventName as studioNotificationEventName };
