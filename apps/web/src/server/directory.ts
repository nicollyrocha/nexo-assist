import type { Analyst, Employee } from "@nexo/shared";
import type { TicketsClient } from "@nexo/tickets-client";

// Nomes de funcionários e analistas vêm do serviço de chamados. São dados estáveis dos seeds,
// então guardamos em memória o que já foi encontrado: o console não refaz chamadas ao legado
// instável a cada polling, e um nome já visto continua aparecendo durante uma queda.

export type Lookup<T> = { ok: true; value: T | null } | { ok: false };

export type Directory = ReturnType<typeof createDirectory>;

export function createDirectory(tickets: TicketsClient) {
  const employees = new Map<string, Employee>();
  const analysts = new Map<string, Analyst>();

  async function employee(id: string): Promise<Lookup<Employee>> {
    const hit = employees.get(id);
    if (hit) return { ok: true, value: hit };
    const r = await tickets.getEmployee(id);
    if (!r.ok) return { ok: false };
    if (r.data) employees.set(id, r.data);
    return { ok: true, value: r.data };
  }

  async function analyst(id: string): Promise<Lookup<Analyst>> {
    const hit = analysts.get(id);
    if (hit) return { ok: true, value: hit };
    const r = await tickets.getAnalyst(id);
    if (!r.ok) return { ok: false };
    if (r.data) analysts.set(id, r.data);
    return { ok: true, value: r.data };
  }

  /** Nomes de vários analistas; quem não for encontrado fica de fora (quem chama usa um rótulo genérico). */
  async function analystNames(ids: Iterable<string>): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    const found = await Promise.all(unique.map(async (id) => [id, await analyst(id)] as const));
    return new Map(found.flatMap(([id, r]) => (r.ok && r.value ? [[id, r.value.name] as const] : [])));
  }

  async function employeesById(ids: Iterable<string>): Promise<Map<string, Employee>> {
    const unique = [...new Set(ids)];
    const found = await Promise.all(unique.map(async (id) => [id, await employee(id)] as const));
    return new Map(found.flatMap(([id, r]) => (r.ok && r.value ? [[id, r.value] as const] : [])));
  }

  /** Analista que está atendendo (nome e nível), ou null se não houver ou o serviço não responder. */
  async function assigned(id: string | null): Promise<{ name: string; tier: Analyst["tier"] } | null> {
    if (!id) return null;
    const r = await analyst(id);
    return r.ok && r.value ? { name: r.value.name, tier: r.value.tier } : null;
  }

  /** Registra quem acabou de fazer login (evita uma consulta depois). */
  function remember(person: { kind: "employee"; value: Employee } | { kind: "analyst"; value: Analyst }) {
    if (person.kind === "employee") employees.set(person.value.id, person.value);
    else analysts.set(person.value.id, person.value);
  }

  return { employee, analyst, analystNames, employeesById, assigned, remember };
}
