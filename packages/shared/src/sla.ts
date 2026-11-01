import { TZDate } from "@date-fns/tz";
import type { Priority } from "./domain";

// Prazos do Anexo A. Interpretações registradas em docs/anexos/A-regras-service-desk.md (notas):
// horário útil seg–sex 8h–18h em America/Sao_Paulo; Crítica conta 1 hora corrida (plantão 24h);
// "N dias úteis" = N × 10 horas úteis, o que equivale ao mesmo horário N dias úteis depois.

export const SERVICE_DESK_TZ = "America/Sao_Paulo";
const OPEN_HOUR = 8;
const CLOSE_HOUR = 18;
const BUSINESS_DAY_MINUTES = (CLOSE_HOUR - OPEN_HOUR) * 60;
const MINUTE = 60_000;

type Deadline = { kind: "corrido" | "util"; minutes: number; label: string };

export const DEADLINES: Record<Priority, Deadline> = {
  critica: { kind: "corrido", minutes: 60, label: "1 hora" },
  alta: { kind: "util", minutes: 4 * 60, label: "4 horas úteis" },
  media: { kind: "util", minutes: 3 * BUSINESS_DAY_MINUTES, label: "3 dias úteis" },
  baixa: { kind: "util", minutes: 5 * BUSINESS_DAY_MINUTES, label: "5 dias úteis" },
};

const isWeekend = (d: TZDate) => d.getDay() === 0 || d.getDay() === 6;

const atHour = (d: TZDate, hour: number) => {
  const copy = new TZDate(d.getTime(), SERVICE_DESK_TZ);
  copy.setHours(hour, 0, 0, 0);
  return copy;
};

/** Próximo instante dentro do horário útil (o próprio instante, se já estiver dentro). */
function nextBusinessInstant(from: Date): TZDate {
  let cur = new TZDate(from.getTime(), SERVICE_DESK_TZ);
  for (;;) {
    if (isWeekend(cur) || cur.getTime() >= atHour(cur, CLOSE_HOUR).getTime()) {
      cur = atHour(cur, OPEN_HOUR);
      cur.setDate(cur.getDate() + 1);
      continue;
    }
    const open = atHour(cur, OPEN_HOUR);
    return cur.getTime() < open.getTime() ? open : cur;
  }
}

export function addBusinessMinutes(from: Date, minutes: number): Date {
  let cur = nextBusinessInstant(from);
  let remaining = minutes * MINUTE;
  for (;;) {
    const available = atHour(cur, CLOSE_HOUR).getTime() - cur.getTime();
    if (remaining <= available) return new Date(cur.getTime() + remaining);
    remaining -= available;
    cur = nextBusinessInstant(atHour(cur, CLOSE_HOUR));
  }
}

/** Prazo da próxima resposta/atualização, contado a partir da última atualização (Anexo A). */
export function computeDueAt(priority: Priority, from: Date): Date {
  const deadline = DEADLINES[priority];
  return deadline.kind === "corrido"
    ? new Date(from.getTime() + deadline.minutes * MINUTE)
    : addBusinessMinutes(from, deadline.minutes);
}

export const isOverdue = (dueAt: Date | null, now: Date) =>
  dueAt !== null && now.getTime() > dueAt.getTime();
