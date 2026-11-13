"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudioNotice } from "./studio-notice";
import { consumeFlashNotification, studioNotificationEventName, type StudioNotification } from "./studio-notifications";

interface VisibleNotification extends StudioNotification {
  readonly id: string;
  readonly createdAt: number;
}

export function StudioNotificationCenter() {
  const [items, setItems] = useState<readonly VisibleNotification[]>([]);

  useEffect(() => {
    const add = (notification: StudioNotification) => {
      const id = notification.id ?? crypto.randomUUID();
      const createdAt = Date.now();
      setItems((current) => [...current.filter((item) => item.id !== id), { ...notification, id, createdAt }].slice(-3));
      if (notification.tone === "success" || notification.tone === "info") {
        window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id || item.createdAt !== createdAt)), 7000);
      }
    };
    const listener = (event: Event) => add((event as CustomEvent<StudioNotification>).detail);
    window.addEventListener(studioNotificationEventName, listener);
    const flash = consumeFlashNotification();
    if (flash) add(flash);
    return () => window.removeEventListener(studioNotificationEventName, listener);
  }, []);

  if (!items.length) return null;
  return <div className="studio-notification-center" aria-label="Notifications">{items.map((item) => <div className="studio-toast" key={item.id}><StudioNotice notice={item}/><Button type="button" variant="ghost" size="icon-sm" className="studio-toast-dismiss" aria-label={`Dismiss ${item.title}`} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><X size={15}/></Button></div>)}</div>;
}
