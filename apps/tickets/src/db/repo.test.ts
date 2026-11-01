import { isOverdue } from "@nexo/shared";
import { beforeAll, describe, expect, it } from "vitest";
import type { TicketsDb } from "./client";
import {
  findEmployeeByEmail,
  getTicketForRequester,
  listTicketsForRequester,
  searchHelpArticles,
} from "./repo";
import { seed } from "./seed";
import { createTestTicketsDb } from "./testing/pglite";

const now = new Date("2026-11-04T15:00:00-03:00"); // quarta-feira, horário comercial
let db: TicketsDb;

beforeAll(async () => {
  db = await createTestTicketsDb();
  await seed(db, now);
});

describe("privacidade dos chamados", () => {
  it("lista só os chamados do próprio funcionário", async () => {
    const tickets = await listTicketsForRequester(db, "emp-ana");
    expect(tickets).toHaveLength(5);
    expect(tickets.every((t) => t.requesterId === "emp-ana")).toBe(true);
  });

  it("não entrega chamado de outra pessoa mesmo sabendo o código", async () => {
    expect(await getTicketForRequester(db, "emp-ana", "INC-20320")).toBeNull();
    expect(await getTicketForRequester(db, "emp-carla", "INC-20320")).not.toBeNull();
  });

  it("funcionário sem chamados recebe lista vazia", async () => {
    expect(await listTicketsForRequester(db, "emp-gabriela")).toEqual([]);
  });
});

describe("situação dos chamados de exemplo (Anexo B)", () => {
  it("Ana tem 3 abertos, e INC-20311 está vencido", async () => {
    const open = await listTicketsForRequester(db, "emp-ana", { openOnly: true });
    expect(open.map((t) => t.id).sort()).toEqual(["INC-20298", "INC-20311", "REQ-10442"]);

    const inc = open.find((t) => t.id === "INC-20311")!;
    expect(isOverdue(new Date(inc.dueAt!), now)).toBe(true);

    const inProgress = open.find((t) => t.id === "INC-20298")!;
    expect(isOverdue(new Date(inProgress.dueAt!), now)).toBe(false);
  });

  it("resolvidos não têm prazo", async () => {
    const sap = await getTicketForRequester(db, "emp-ana", "INC-20150");
    expect(sap?.status).toBe("resolvido");
    expect(sap?.dueAt).toBeNull();
  });
});

describe("login por e-mail", () => {
  it("encontra o funcionário ignorando maiúsculas e espaços", async () => {
    expect((await findEmployeeByEmail(db, "  Ana.Souza@NEXO.com.br "))?.id).toBe("emp-ana");
    expect(await findEmployeeByEmail(db, "fulano@gmail.com")).toBeNull();
  });
});

describe("central de ajuda", () => {
  it.each([
    ["Meu notebook não conecta na VPN, erro 809", "KB-001"],
    ["esqueci minha senha e bloqueou", "KB-003"],
    ["qual o horário de atendimento do service desk?", "KB-002"],
    ["o notebook ficou lento depois da atualização", "KB-007"],
  ])("“%s” encontra %s", async (question, expected) => {
    const [first] = await searchHelpArticles(db, question);
    expect(first?.id).toBe(expected);
  });

  it("pergunta sem relação não devolve artigo", async () => {
    expect(await searchHelpArticles(db, "xyzzy")).toEqual([]);
  });
});
