import { expect, request, type Page } from "@playwright/test";
import { ConsoleConversation, ConsoleList } from "@nexo/shared";

const BASE = "http://localhost:3000";
export const RAFAEL = "rafael.lima@nexo.com.br";

export async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("qualquer-senha");
  await page.getByRole("button", { name: /Entrar/ }).click();
  await expect(page).toHaveURL(/\/(chat|console)/);
}

/** Garante uma conversa em que o agent responde: começa outra se a anterior foi encerrada. */
export async function readyToChat(page: Page) {
  const fresh = page.getByRole("button", { name: "Começar nova conversa" });
  const box = page.getByRole("textbox", { name: "Mensagem para o Nexo Assist" });
  await expect(fresh.or(box)).toBeVisible();
  if (await fresh.isVisible()) await fresh.click();
  await expect(box).toBeEnabled();
}

/** Envia e espera o turno acabar (o campo volta a aceitar texto). */
export async function send(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Mensagem para o Nexo Assist" });
  await expect(box).toBeEnabled();
  await box.fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(box).toBeEnabled({ timeout: 150_000 });
}

export const chatLog = (page: Page) => page.getByRole("log", { name: "Mensagens" });
export const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/telas/${name}.png` });

/**
 * Encerra pelo console, como o Rafael, as conversas do funcionário que estão com analista — o que
 * sobra de uma execução interrompida. Assim cada execução começa de uma conversa em que o agent responde.
 */
export async function releaseConversations(employeeName: string) {
  const api = await request.newContext({ baseURL: BASE });
  try {
    expect((await api.post("/api/auth/login", { data: { email: RAFAEL, password: "x" } })).ok()).toBe(true);
    const list = ConsoleList.parse(await (await api.get(`/api/console/conversations?filter=todas&q=${encodeURIComponent(employeeName)}`)).json());
    for (const c of list.conversations) {
      if (c.employee.name !== employeeName || (c.status !== "aguardando_atendente" && c.status !== "em_atendimento")) continue;
      let detail = ConsoleConversation.parse(await (await api.get(`/api/console/conversations/${c.id}`)).json());
      if (detail.conversation.status === "aguardando_atendente") {
        const claimed = await api.post(`/api/console/conversations/${c.id}/claim`, { data: { version: detail.conversation.version } });
        if (!claimed.ok()) continue;
        detail = ConsoleConversation.parse(await claimed.json());
      }
      // Atendida por outro analista: não é do Rafael encerrar.
      if (detail.conversation.assignedAnalystId !== "ana-rafael") continue;
      await api.post(`/api/console/conversations/${c.id}/close`, { data: { version: detail.conversation.version } });
    }
  } finally {
    await api.dispose();
  }
}
