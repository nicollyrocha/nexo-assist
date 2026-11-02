import { expect, test, type Page } from "@playwright/test";

// História ponta a ponta com o agent real: dúvida resolvida no chat com o detalhe da decisão,
// transferência a pedido (agent pausado) e o analista assumindo e devolvendo a conversa.
// Usa o Fábio, que nos dados de exemplo não tem conversa transferida; a última etapa devolve a
// conversa ao agent, então o teste pode ser repetido.

const FUNCIONARIO = "fabio.nunes@nexo.com.br";
const ANALISTA = "rafael.lima@nexo.com.br";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("qualquer-senha");
  await page.getByRole("button", { name: /Entrar/ }).click();
}

async function send(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: /Mensagem para/ });
  await expect(box).toBeEnabled();
  await box.fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
}

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/telas/${name}.png` });

test("rotas protegidas: sem sessão volta ao login; funcionário não abre o console", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/$/);
  await shot(page, "tela-1-login");

  await login(page, FUNCIONARIO);
  await expect(page).toHaveURL(/\/chat/);
  await page.goto("/console");
  await expect(page).toHaveURL(/\/chat/);
});

test("funcionário tira dúvida, vê o porquê e pede um analista", async ({ page }) => {
  await login(page, FUNCIONARIO);
  await expect(page).toHaveURL(/\/chat/);

  await send(page, "Qual o horário de atendimento do service desk?");
  const log = page.getByRole("log", { name: "Mensagens" });
  await expect(log).toContainText(/8h.*18h/);

  // Transparência: chips das ações e o detalhe com entendimento, confiança e por quê.
  await expect(log.getByRole("list", { name: "O que o assistente fez" }).last()).toBeVisible();
  const why = log.getByRole("button", { name: "Por que o assistente respondeu assim" }).last();
  await why.click();
  await expect(why).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(`#${await why.getAttribute("aria-controls")}`)).toBeVisible();
  await shot(page, "tela-2-chat-decisao");

  await page.setViewportSize({ width: 375, height: 812 });
  await shot(page, "tela-2-chat-375");
  await page.setViewportSize({ width: 1440, height: 900 });

  await send(page, "Quero falar com um analista, por favor.");
  await expect(page.getByText("Chamei um analista para você")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mensagem para o analista" })).toBeVisible();
  await shot(page, "tela-3-chat-transferido");
});

test("analista vê a conversa aguardando, assume e devolve ao agent", async ({ page }) => {
  await login(page, ANALISTA);
  await expect(page).toHaveURL(/\/console/);

  const list = page.getByRole("navigation", { name: "Lista de conversas" }).or(page.getByLabel("Lista de conversas"));
  const item = list.getByText("Fábio Nunes").first();
  await expect(item).toBeVisible();
  await item.click();
  await shot(page, "tela-4-console-aguardando");

  await page.getByRole("button", { name: "Assumir atendimento" }).click();
  // Atendendo: o analista já pode escrever (o "Assumindo…" terminou).
  await expect(page.getByRole("button", { name: /Assumindo/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Devolver ao agent/ }).first()).toBeVisible();
  await shot(page, "tela-5-console-atendendo");

  await page.getByRole("button", { name: /Devolver ao agent/ }).first().click();
  await expect(page.getByRole("button", { name: "Assumir atendimento" })).toHaveCount(0);
  await expect(page.getByText(/devolveu a conversa ao agent/).last()).toBeVisible();
});
