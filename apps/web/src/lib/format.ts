import { SERVICE_DESK_TZ } from "@nexo/shared";

// Formatação de datas e números em pt-BR, sempre no fuso do service desk (America/Sao_Paulo),
// para servidor e navegador mostrarem o mesmo horário (sem diferença de hidratação).

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SERVICE_DESK_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

function partsOf(date: Date): Parts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute };
}

const toDate = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);
const pad = (n: number) => String(n).padStart(2, "0");

/** Dias de calendário (no fuso do service desk) entre `from` e `to`. */
export function calendarDaysBetween(from: Date | string, to: Date | string): number {
  const a = partsOf(toDate(from));
  const b = partsOf(toDate(to));
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

export const dayKey = (value: Date | string) => {
  const p = partsOf(toDate(value));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

/** "13:43" */
export function formatTime(value: Date | string): string {
  const p = partsOf(toDate(value));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "16 out" */
export function formatShortDate(value: Date | string): string {
  const p = partsOf(toDate(value));
  return `${pad(p.day)} ${MONTHS[p.month - 1]}`;
}

/** "16 out, 14:20" */
export const formatDateTime = (value: Date | string) => `${formatShortDate(value)}, ${formatTime(value)}`;

/** Separador de dia: "Hoje", "Ontem", "28 out". */
export function formatDayLabel(value: Date | string, now: Date): string {
  const diff = calendarDaysBetween(value, now);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return formatShortDate(value);
}

/** Hora na lista do console: "10:05" hoje, "ontem", "28 out". */
export function formatListTime(value: Date | string, now: Date): string {
  const diff = calendarDaysBetween(value, now);
  if (diff === 0) return formatTime(value);
  if (diff === 1) return "ontem";
  return formatShortDate(value);
}

/** "agora", "há 1 min", "há 25 min", "há 2 h", "há 5 dias". */
export function formatAgo(value: Date | string, now: Date): string {
  const ms = Math.max(0, now.getTime() - toDate(value).getTime());
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.max(1, calendarDaysBetween(value, now));
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** Minutos desde `value` (para destacar esperas longas). */
export const minutesSince = (value: Date | string, now: Date) =>
  Math.floor(Math.max(0, now.getTime() - toDate(value).getTime()) / 60_000);

/** Prazo futuro: "até 13:43" (hoje), "até amanhã, 10:00", "até 05 nov, 10:00". */
export function formatDeadline(value: Date | string, now: Date): string {
  const diff = calendarDaysBetween(now, value);
  if (diff <= 0) return `até ${formatTime(value)}`;
  if (diff === 1) return `até amanhã, ${formatTime(value)}`;
  return `até ${formatDateTime(value)}`;
}

const intFormatter = new Intl.NumberFormat("pt-BR");
export const formatInt = (n: number) => intFormatter.format(n);

const secondsFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** "0,8 s" */
export const formatSeconds = (ms: number) => `${secondsFormatter.format(ms / 1000)} s`;

export const percent = (score: number) => Math.round(score * 100);

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Avatar do console: cor estável por id (soma dos códigos de caractere mod 7, tokens.md). */
export const AVATAR_COLORS = [
  "bg-avatar-0 text-avatar-0-ink",
  "bg-avatar-1 text-avatar-1-ink",
  "bg-avatar-2 text-avatar-2-ink",
  "bg-avatar-3 text-avatar-3-ink",
  "bg-avatar-4 text-avatar-4-ink",
  "bg-avatar-5 text-avatar-5-ink",
  "bg-avatar-6 text-avatar-6-ink",
] as const;

export function avatarColor(id: string): string {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
