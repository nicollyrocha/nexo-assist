import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  REOPEN_WINDOW_DAYS,
  computeDueAt,
  isOpenStatus,
  type AddCommentInput,
  type ApiErrorCode,
  type CreateTicketInput,
  type ReopenTicketInput,
  type TicketWithEvents,
  type TransferTicketInput,
} from "@nexo/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import type { TicketsDb } from "../db/client";
import { toTicket } from "../db/repo";
import * as schema from "../db/schema";

// Regras de escrita do serviço de chamados. Toda operação recebe o requesterId: um funcionário
// só lê e altera os próprios chamados (Anexo A: privacidade). Mutações aceitam uma chave de
// idempotência — o cliente repete a chamada quando o legado cai, e a repetição não duplica nada.

export class ServiceError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const notFound = (ticketId: string) =>
  new ServiceError("not_found", `Chamado ${ticketId} não encontrado para este funcionário.`, 404);

const TRANSFER_TEAM = "Suporte N2";
const DAY = 24 * 3_600_000;

const isUniqueViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === "23505" ||
  (error as { code?: string }).code === "23505";

export async function getTicketWithEvents(
  db: TicketsDb,
  requesterId: string,
  ticketId: string,
): Promise<TicketWithEvents | null> {
  const [row] = await db
    .select()
    .from(schema.tickets)
    .where(and(eq(schema.tickets.id, ticketId), eq(schema.tickets.requesterId, requesterId)));
  if (!row) return null;
  const events = await db
    .select()
    .from(schema.ticketEvents)
    .where(eq(schema.ticketEvents.ticketId, ticketId))
    .orderBy(asc(schema.ticketEvents.createdAt));
  return {
    ...toTicket(row),
    events: events.map((e) => ({
      id: e.id,
      ticketId: e.ticketId,
      kind: e.kind,
      authorKind: e.authorKind,
      authorId: e.authorId,
      body: e.body,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

async function requireTicket(db: TicketsDb, requesterId: string, ticketId: string) {
  const ticket = await getTicketWithEvents(db, requesterId, ticketId);
  if (!ticket) throw notFound(ticketId);
  return ticket;
}

async function findTicketByKey(db: TicketsDb, requesterId: string, key: string) {
  const [row] = await db
    .select({ id: schema.tickets.id })
    .from(schema.tickets)
    .where(and(eq(schema.tickets.idempotencyKey, key), eq(schema.tickets.requesterId, requesterId)));
  return row ? getTicketWithEvents(db, requesterId, row.id) : null;
}

async function eventExists(db: TicketsDb, key: string | null) {
  if (!key) return false;
  const [row] = await db
    .select({ id: schema.ticketEvents.id })
    .from(schema.ticketEvents)
    .where(eq(schema.ticketEvents.idempotencyKey, key));
  return Boolean(row);
}

/** Insere o evento; se outra tentativa com a mesma chave chegou antes, não faz nada. */
async function insertEventOnce(db: TicketsDb, event: typeof schema.ticketEvents.$inferInsert) {
  try {
    await db.insert(schema.ticketEvents).values(event);
    return true;
  } catch (error) {
    if (event.idempotencyKey && isUniqueViolation(error)) return false;
    throw error;
  }
}

async function nextNumber(db: TicketsDb, type: CreateTicketInput["type"]): Promise<number> {
  // Nome da sequência vem de um enum fechado, não da entrada do usuário.
  const sequence = type === "INC" ? "inc_seq" : "req_seq";
  const result = await db.execute(sql.raw(`select nextval('${sequence}')::int as n`));
  return (result as unknown as { rows: { n: number }[] }).rows[0]!.n;
}

/** Base do prazo (Anexo A): a última atualização do analista ou, sem ela, a abertura. */
async function deadlineBase(db: TicketsDb, ticketId: string): Promise<Date> {
  const [row] = await db
    .select({ last: schema.tickets.lastAnalystUpdateAt, opened: schema.tickets.openedAt })
    .from(schema.tickets)
    .where(eq(schema.tickets.id, ticketId));
  return row!.last ?? row!.opened;
}

export async function createTicket(
  db: TicketsDb,
  requesterId: string,
  input: CreateTicketInput,
  idempotencyKey: string | null,
  now = new Date(),
): Promise<{ ticket: TicketWithEvents; created: boolean }> {
  if (idempotencyKey) {
    const existing = await findTicketByKey(db, requesterId, idempotencyKey);
    if (existing) return { ticket: existing, created: false };
  }

  const id = `${input.type}-${await nextNumber(db, input.type)}`;

  try {
    await db.insert(schema.tickets).values({
      id,
      type: input.type,
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority,
      affected: input.affected,
      status: "aberto",
      requesterId,
      assignedTeam: input.priority === "critica" ? TRANSFER_TEAM : "Suporte N1",
      openedAt: now,
      updatedAt: now,
      dueAt: computeDueAt(input.priority, now),
      idempotencyKey,
    });
  } catch (error) {
    if (idempotencyKey && isUniqueViolation(error)) {
      const existing = await findTicketByKey(db, requesterId, idempotencyKey);
      if (existing) return { ticket: existing, created: false };
    }
    throw error;
  }

  await insertEventOnce(db, {
    ticketId: id,
    kind: "status",
    authorKind: "agent",
    authorId: "nexo-assist",
    body: `Chamado aberto pelo Nexo Assist após confirmação do funcionário. ${CATEGORY_LABELS[input.category]}, prioridade ${PRIORITY_LABELS[input.priority]}: ${input.priorityReason}`,
    createdAt: now,
  });

  return { ticket: await requireTicket(db, requesterId, id), created: true };
}

export async function addComment(
  db: TicketsDb,
  requesterId: string,
  ticketId: string,
  input: AddCommentInput,
  idempotencyKey: string | null,
  now = new Date(),
): Promise<TicketWithEvents> {
  const ticket = await requireTicket(db, requesterId, ticketId);
  if (await eventExists(db, idempotencyKey)) return ticket;
  if (!isOpenStatus(ticket.status)) {
    throw new ServiceError("ticket_closed", `O chamado ${ticketId} está ${ticket.status}; reabra antes de complementar.`, 409);
  }

  const inserted = await insertEventOnce(db, {
    ticketId,
    kind: "comentario",
    authorKind: "funcionario",
    authorId: requesterId,
    body: input.body,
    createdAt: now,
    idempotencyKey,
  });
  if (!inserted) return requireTicket(db, requesterId, ticketId);

  const priorityChanged = input.priority && input.priority !== ticket.priority;
  if (priorityChanged) {
    await db.insert(schema.ticketEvents).values({
      ticketId,
      kind: "status",
      authorKind: "agent",
      authorId: "nexo-assist",
      body: `Prioridade alterada de ${PRIORITY_LABELS[ticket.priority]} para ${PRIORITY_LABELS[input.priority!]}: ${input.priorityReason ?? "nova informação do funcionário"}`,
      createdAt: now,
    });
  }

  await db
    .update(schema.tickets)
    .set({
      updatedAt: now,
      ...(priorityChanged && {
        priority: input.priority,
        // O prazo continua contando da mesma base, agora com o prazo da nova prioridade.
        dueAt: computeDueAt(input.priority!, await deadlineBase(db, ticketId)),
      }),
    })
    .where(eq(schema.tickets.id, ticketId));

  return requireTicket(db, requesterId, ticketId);
}

export async function reopenTicket(
  db: TicketsDb,
  requesterId: string,
  ticketId: string,
  input: ReopenTicketInput,
  idempotencyKey: string | null,
  now = new Date(),
): Promise<TicketWithEvents> {
  const ticket = await requireTicket(db, requesterId, ticketId);
  if (await eventExists(db, idempotencyKey)) return ticket;
  if (ticket.status !== "resolvido" || !ticket.resolvedAt) {
    throw new ServiceError("ticket_not_resolved", `O chamado ${ticketId} não está resolvido.`, 409);
  }
  if (now.getTime() - new Date(ticket.resolvedAt).getTime() > REOPEN_WINDOW_DAYS * DAY) {
    throw new ServiceError(
      "reopen_window_expired",
      `O chamado ${ticketId} foi resolvido há mais de ${REOPEN_WINDOW_DAYS} dias e não pode ser reaberto.`,
      409,
    );
  }

  const inserted = await insertEventOnce(db, {
    ticketId,
    kind: "reabertura",
    authorKind: "funcionario",
    authorId: requesterId,
    body: input.reason,
    createdAt: now,
    idempotencyKey,
  });
  if (inserted) {
    await db
      .update(schema.tickets)
      .set({ status: "aberto", resolvedAt: null, updatedAt: now, dueAt: computeDueAt(ticket.priority, now) })
      .where(eq(schema.tickets.id, ticketId));
  }
  return requireTicket(db, requesterId, ticketId);
}

export async function transferTicket(
  db: TicketsDb,
  requesterId: string,
  ticketId: string,
  input: TransferTicketInput,
  idempotencyKey: string | null,
  now = new Date(),
): Promise<TicketWithEvents> {
  const ticket = await requireTicket(db, requesterId, ticketId);
  if (await eventExists(db, idempotencyKey)) return ticket;
  if (!isOpenStatus(ticket.status)) {
    throw new ServiceError("ticket_closed", `O chamado ${ticketId} está ${ticket.status}.`, 409);
  }

  const inserted = await insertEventOnce(db, {
    ticketId,
    kind: "transferencia",
    authorKind: "agent",
    authorId: "nexo-assist",
    body: `Transferido para ${TRANSFER_TEAM} (${input.reason}). Resumo: ${input.summary}`,
    createdAt: now,
    idempotencyKey,
  });
  if (inserted) {
    await db
      .update(schema.tickets)
      .set({ status: "aguardando_analista", assignedTeam: TRANSFER_TEAM, updatedAt: now })
      .where(eq(schema.tickets.id, ticketId));
  }
  return requireTicket(db, requesterId, ticketId);
}
