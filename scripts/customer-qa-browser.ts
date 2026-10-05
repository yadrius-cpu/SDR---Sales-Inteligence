import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, type Browser, type Page } from "playwright";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { customerDrafts, customerLeads, customerTasks } from "../src/db/schema";

const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
const email = process.env.CUSTOMER_QA_EMAIL ?? "cliente.teste@phishshield.local";
const password = process.env.CUSTOMER_QA_PASSWORD ?? "TesteSales2026!Mvp";
const companyName = `QA Senior ${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;

let browser: Browser | undefined;
let page: Page | undefined;

async function assertActive(href: string) {
  assert.equal(await page!.locator('a[aria-current="page"]').getAttribute("href"), href);
  assert.ok(await page!.getByText(/Voc.{0,3} est.{0,3} em:/).count(), `Localização ausente em ${href}`);
}

async function main() {
  const parsedOrigin = new URL(origin);
  if (process.env.NODE_ENV === "production" || !["127.0.0.1", "localhost"].includes(parsedOrigin.hostname)) {
    throw new Error("O QA de cliente só pode rodar contra um servidor local.");
  }

  browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL ?? "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const externalRequests: string[] = [];
  await context.route("**/*", route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== origin) {
      externalRequests.push(requestUrl.href);
      return route.abort();
    }
    return route.continue();
  });
  page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${origin}/login`);
  await page.getByLabel("E-mail profissional").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(`${origin}/`);
  await page.goto(`${origin}/customer/dashboard`);
  await page.getByRole("heading", { name: /Ol/ }).waitFor();
  await assertActive("/customer/dashboard");

  await page.getByRole("link", { name: /Como usar/ }).click();
  await page.waitForURL(`${origin}/help`);
  await page.getByRole("heading", { name: /Como usar/ }).waitFor();
  assert.ok(await page.locator('img').count(), "A central de ajuda deve exibir imagens");
  await assertActive("/help");

  await page.goto(`${origin}/onboarding`);
  await page.getByRole("heading").first().waitFor();
  assert.ok(await page.locator('nav a').count(), "O menu lateral deve permanecer no onboarding");
  await assertActive("/onboarding");

  await page.goto(`${origin}/customer/leads`);
  await page.getByLabel("Empresa", { exact: true }).fill(companyName);
  await page.getByLabel("Domínio", { exact: true }).fill(`${companyName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.invalid`);
  await page.getByLabel("Nome do contato", { exact: true }).fill("Pessoa QA");
  await page.getByLabel("Cargo", { exact: true }).fill("Direção");
  await page.getByLabel("E-mail profissional", { exact: true }).fill("qa@example.invalid");
  await page.getByLabel("Próxima ação", { exact: true }).fill("Revisar hipótese comercial");
  await page.getByRole("button", { name: "Cadastrar lead", exact: true }).click();
  await page.waitForURL(`${origin}/customer/leads`);
  await page.getByText(companyName, { exact: true }).waitFor();
  await assertActive("/customer/leads");

  const leadLink = page.getByRole("link", { name: `${companyName} →`, exact: true }).first();
  await leadLink.click();
  await page.getByRole("heading", { name: `Editar ${companyName}`, exact: true }).waitFor();
  assert.ok(await page.getByText(/A an.{0,3}lise n.{0,3}o envia/).count());
  await page.getByRole("button", { name: "Analisar lead", exact: true }).click();
  await page.waitForURL(/\/customer\/leads\/[^/]+\/edit$/);
  await page.getByRole("heading", { name: /Ader.{0,3}ncia estimada/ }).waitFor();
  await page.getByRole("button", { name: "Gerar rascunho", exact: true }).click();
  await page.waitForURL(/\/customer\/leads\/[^/]+\/edit$/);
  await page.getByText("Rascunho", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Aprovar para copiar", exact: true }).click();
  await page.waitForURL(/\/customer\/leads\/[^/]+\/edit$/);
  await page.getByText("Aprovado", { exact: true }).waitFor();

  await page.goto(`${origin}/customer/tasks`);
  await page.getByRole("heading", { name: /Tarefas de follow-up/ }).waitFor();
  await assertActive("/customer/tasks");
  await page.locator('select[name="leadId"]').selectOption({ label: companyName });
  await page.locator('input[name="dueAt"]').fill("2030-01-15T10:00");
  await page.locator('textarea[name="description"]').fill("Revisar a hipótese e decidir a próxima conversa");
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await page.waitForURL(`${origin}/customer/tasks`);
  await page.getByText("Revisar a hipótese e decidir a próxima conversa", { exact: true }).waitFor();

  await page.goto(`${origin}/customer/leads/import`);
  await page.locator("textarea").fill(`empresa,dominio,contato,email\n${companyName} importada,importada.invalid,Ana QA,ana@example.invalid\n${companyName} importada,importada.invalid,Ana QA,ana@example.invalid`);
  await page.getByRole("button", { name: "Ler colunas", exact: true }).click();
  await page.getByRole("heading", { name: /2\. Mapear colunas/ }).waitFor();
  await page.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await page.getByRole("heading", { name: /3\. Revisar importação/ }).waitFor();
  assert.ok(await page.getByText(/poss.{0,3}veis duplicados/).count());
  await page.getByRole("button", { name: "Confirmar importação", exact: true }).click();
  await page.getByRole("heading", { name: /Importa.{0,3}o conclu.{0,3}da/ }).waitFor();
  assert.ok(await page.getByText(/1 leads criados/).count());

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/customer-qa-final.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Layout estoura no mobile");
  await page.screenshot({ path: "test-results/customer-qa-mobile.png", fullPage: true });

  assert.deepEqual(pageErrors, [], `Erros de página: ${pageErrors.join(" | ")}`);
  assert.deepEqual(externalRequests, [], `Chamadas externas detectadas: ${externalRequests.join(" | ")}`);
  console.log("QA cliente aprovado: login, menu ativo, ajuda, onboarding, lead, análise, rascunho, aprovação, tarefas, importação CSV, mobile e ausência de chamadas externas.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (page && process.exitCode !== 0) {
    await mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/customer-qa-failure.png", fullPage: true }).catch(() => undefined);
  }
  const leads = await db.select({ id: customerLeads.id }).from(customerLeads).where(eq(customerLeads.companyName, companyName));
  const leadIds = leads.map(lead => lead.id);
  if (leadIds.length) {
    await db.delete(customerDrafts).where(inArray(customerDrafts.leadId, leadIds));
    await db.delete(customerTasks).where(inArray(customerTasks.leadId, leadIds));
    await db.delete(customerLeads).where(inArray(customerLeads.id, leadIds));
  }
  await browser?.close();
  await pool.end();
});
