import { expect, test } from "@playwright/test";
import { chatLog as log, login, readyToChat, RAFAEL, releaseConversations, send, shot } from "./helpers";

// Histórias 2, 3, 4 e 6 com o agent real. Pode rodar de novo sem recriar os dados de exemplo:
// na segunda vez a Gabriela já tem o chamado da VPN, e a trava de duplicidade não deixa criar outro
// (o agent complementa ou aponta o existente) — o teste aceita esses caminhos e confere qual foi.

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await releaseConversations("Gabriela Rocha");
  await releaseConversations("Ana Souza");
});

const ANA = "ana.souza@nexo.com.br";
const GABRIELA = "gabriela.rocha@nexo.com.br";

test("abrir chamado conversando: rascunho, confirmação e sem duplicidade (história 4)", async ({ page }) => {
  await login(page, GABRIELA);
  await readyToChat(page);

  await send(
    page,
    "Meu notebook com Windows 11 não conecta na VPN, dá erro 809. Só comigo. Tenho uma apresentação para um cliente hoje às 16h.",
  );

  const create = page.getByRole("button", { name: "Confirmar e criar o chamado" }).last();
  const update = page.getByRole("button", { name: /Confirmar (atualização|reabertura)/ }).last();
  await shot(page, "tela-2-rascunho");

  if (await create.isVisible()) {
    // Nada é criado antes de confirmar: o rascunho mostra os campos do Anexo A.
    await expect(log(page)).toContainText("Rede e VPN");
    await expect(log(page)).toContainText(/Alta|Crítica/);
    await create.click();
    await expect(log(page)).toContainText(/INC-\d{5}/, { timeout: 150_000 });
  } else if (await update.isVisible()) {
    // Já existe chamado aberto sobre isso: complementa em vez de duplicar.
    await update.click();
    await expect(log(page)).toContainText(/INC-\d{5}/, { timeout: 150_000 });
  } else {
    // Ou aponta o chamado existente (e oferece um analista) — o que não pode é propor outro.
    await expect(log(page).getByText(/INC-\d{5}/).last()).toBeVisible();
  }
  await shot(page, "tela-2-chamado-criado");
});

test("voltar outro dia e continuar de onde parou (história 6)", async ({ page }) => {
  await login(page, GABRIELA);
  // Sessão nova (outro login), mesma conversa: o histórico volta.
  await expect(log(page)).toContainText("erro 809");
  await expect(log(page)).toContainText(/INC-\d{5}/);
});

test("consultar chamado sem número, ver que está vencido e complementar (histórias 2 e 3)", async ({ page }) => {
  await login(page, ANA);
  await readyToChat(page);

  await send(page, "Como está o meu chamado do notebook lento?");
  await expect(log(page)).toContainText("INC-20311");
  await expect(log(page)).toContainText(/vencid/i);
  await shot(page, "tela-3-consulta-vencido");

  await send(page, "Quero acrescentar que agora o Excel também fecha sozinho quando abro planilhas grandes.");
  const update = page.getByRole("button", { name: /Confirmar atualização/ }).last();
  await expect(update).toBeVisible({ timeout: 150_000 });
  // Complementa o chamado existente, não abre outro.
  await expect(page.getByRole("button", { name: "Confirmar e criar o chamado" })).toHaveCount(0);
  await update.click();
  await expect(log(page).getByText(/INC-20311/).last()).toBeVisible();
  await shot(page, "tela-3-complemento");
});

test("console: filtros e painel com os chamados do funcionário (Tela 4)", async ({ page }) => {
  await login(page, RAFAEL);
  const filters = page.getByRole("group", { name: "Filtrar conversas" }).or(page.getByLabel("Filtrar conversas"));
  await filters.getByText("Com o agent").click();
  await expect(page).toHaveURL(/filter=com_agent/);
  await page.getByRole("list", { name: "Lista de conversas" }).or(page.getByLabel("Lista de conversas")).getByText("Ana Souza").first().click();
  const panel = page.getByRole("complementary", { name: /Chamados de Ana Souza/ });
  await expect(panel).toContainText("INC-20311");
  // Privacidade: o painel só traz chamados da própria Ana.
  await expect(panel).not.toContainText("INC-20320");
  await shot(page, "tela-4-console-com-agent");
});
