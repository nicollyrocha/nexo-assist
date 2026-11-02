"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** "⌘↵" no macOS, "Ctrl ↵" nos demais. No servidor, "Ctrl ↵" (o atalho só aparece com hover:hover). */
export function useShortcutLabel(): string {
  return useSyncExternalStore(
    subscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘↵" : "Ctrl ↵"),
    () => "Ctrl ↵",
  );
}

/** Relógio que avança a cada `ms` (prazos, "há X min"). */
export function useNow(ms = 30_000): Date {
  return useSyncExternalStore(
    (notify) => {
      const id = window.setInterval(notify, ms);
      return () => window.clearInterval(id);
    },
    () => currentMinute(ms),
    () => currentMinute(ms),
  );
}

// Snapshot estável entre chamadas (useSyncExternalStore exige o mesmo valor até mudar).
let cached: { bucket: number; date: Date } | null = null;
function currentMinute(ms: number): Date {
  const bucket = Math.floor(Date.now() / ms);
  if (!cached || cached.bucket !== bucket) cached = { bucket, date: new Date() };
  return cached.date;
}
