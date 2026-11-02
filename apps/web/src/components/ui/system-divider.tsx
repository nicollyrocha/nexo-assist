import { ArrowRightLeft, Bot, CircleCheck, Headset, History, Info } from "lucide-react";
import { eventIcon, type EventIcon } from "@/lib/conversation-state";

const ICONS: Record<EventIcon, typeof Info> = {
  transfer: ArrowRightLeft,
  claimed: Headset,
  returned: Bot,
  closed: CircleCheck,
  history: History,
  info: Info,
};

/** Divisória de evento de sistema ("Transferida para um analista · 10:05"). */
export function SystemDivider({ text, time, icon, className = "pt-2 pb-1" }: { text: string; time?: string; icon?: EventIcon; className?: string }) {
  const Icon = ICONS[icon ?? eventIcon(text)];
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="sr-only">{time ? `${text} · ${time}` : text}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-divider-soft" />
      <span aria-hidden="true" className="flex max-w-[80%] items-center gap-1.5 text-center text-caption font-medium text-muted">
        <Icon className="size-3.25 shrink-0" />
        <span>
          {text}
          {time && <span className="tabular-nums"> · {time}</span>}
        </span>
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-divider-soft" />
    </div>
  );
}

export function DayPill({ label, className = "bg-surface-subtle" }: { label: string; className?: string }) {
  return (
    <div className="flex justify-center pb-1">
      <span className={`rounded-full px-2.5 py-1 text-caption font-medium text-muted ${className}`}>{label}</span>
    </div>
  );
}
