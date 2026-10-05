import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { request, createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";
import { chromium, type Browser } from "playwright";
import { db, pool } from "../src/db";
import { users, sessions, loginAttempts, companies, companyImports, auditEvents, aiDailyUsage, contacts, opportunities, activities } from "../src/db/schema";
import { hashPassword, hashToken } from "../src/lib/security";
import { conversationRoute } from "../src/lib/conversations/service";
import { securityMatrix } from "./security-matrix";

// Local, bounded assessment. Never target a production database or a shared active workspace.
const origin = process.env.SECURITY_TEST_ORIGIN ?? "http://127.0.0.1:3001";
const tag = `security-${randomUUID()}`, password = randomBytes(24).toString("hex");
const actors: (typeof users.$inferSelect)[] = [], companyIds: string[] = [], batchIds: string[] = [];
const attemptKeys: string[] = [];
const checks: { name: string; passed: boolean; observed: unknown }[] = [];
const observations: Record<string, unknown> = {};
let browser: Browser | undefined;
let attackerServer:Server|undefined;
function check(name: string, passed: boolean, observed: unknown) { checks.push({ name, passed, observed }); }
async function api(path: string, method = "GET", body?: unknown, cookie = "", requestOrigin: string | null = origin) {
  return fetch(`${origin}/api/v1/${path}`, { method, headers: { "Content-Type": "application/json", cookie, ...(requestOrigin === null ? {} : { origin: requestOrigin }) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(15000) });
}
async function login(actor: typeof users.$inferSelect) {
  const r = await api("auth/login", "POST", { email: actor.email, password });
  if (r.status !== 200) throw new Error(`Fixture login failed: ${r.status}`);
  const header = r.headers.get("set-cookie")!;
  check(`Production session flags: ${actor.role}`, /HttpOnly/i.test(header) && /Secure/i.test(header) && /SameSite=lax/i.test(header), { httpOnly: /HttpOnly/i.test(header), secure: /Secure/i.test(header), sameSiteLax: /SameSite=lax/i.test(header) });
  return header.split(";")[0];
}
async function main() {
  const target = new URL(origin), database = new URL(process.env.DATABASE_URL!);
  if(!/^\/security_lab_[a-f0-9]{16}$/.test(database.pathname))throw new Error("Use security-lab.ts: this assessment only accepts its isolated database.");
  if (process.env.SECURITY_TEST_LOCAL !== "true" || target.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(target.hostname) || !["127.0.0.1", "localhost"].includes(database.hostname)) throw new Error("Set SECURITY_TEST_LOCAL=true only for an isolated local app/database.");
  const healthy = await fetch(origin + "/login", { signal: AbortSignal.timeout(10000) });
  if (healthy.status !== 200) throw new Error("Local server unavailable");
  for (const role of ["owner", "operator", "operator", "viewer", "operator"] as const) {
    const email = `${tag}-${actors.length}@example.invalid`;
    const [actor] = await db.insert(users).values({ email, name: "Security fixture", role, passwordHash: hashPassword(password) }).returning();
    actors.push(actor); attemptKeys.push(hashToken(email));
  }
  const [owner, operator, otherOperator, viewer, victim] = actors;
  const ownerCookie = await login(owner), operatorCookie = await login(operator), otherCookie = await login(otherOperator), viewerCookie = await login(viewer);
  for (const path of ["me", "companies", "campaigns", "pipeline", "admin/users", "admin/audit"]) {
    const r = await api(path); check(`Unauthenticated ${path}`, r.status === 401, r.status);
  }
  for (const badOrigin of [null, "null", "https://attacker.invalid"]) {
    const r = await api("companies", "POST", {}, operatorCookie, badOrigin);
    check(`CSRF Origin=${badOrigin ?? "missing"}`, r.status === 403, r.status);
  }
  for (const cookie of [operatorCookie, viewerCookie]) {
    const r = await api("admin/users", "GET", undefined, cookie); check("Non-owner admin access", r.status === 403, r.status);
  }
  const denied = await api("companies", "POST", { displayName: tag, sector: "Fixture" }, viewerCookie);
  check("Viewer write denied", denied.status === 403, denied.status);
  const tampered = await api("me", "GET", undefined, "sales_session=" + randomBytes(32).toString("hex"));
  check("Forged session", tampered.status === 401, tampered.status);
  const expiredToken = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ userId: otherOperator.id, tokenHash: hashToken(expiredToken), expiresAt: new Date(Date.now() - 60000) });
  const expired = await api("me", "GET", undefined, "sales_session=" + expiredToken);
  check("Expired session", expired.status === 401, expired.status);
  await db.update(users).set({ active: false }).where(eq(users.id, otherOperator.id));
  const disabled = await api("me", "GET", undefined, otherCookie);
  check("Disabled user invalidates session", disabled.status === 401, disabled.status);
  await db.update(users).set({ active: true }).where(eq(users.id, otherOperator.id));
  const me = await (await api("me", "GET", undefined, operatorCookie)).json();
  check("Identity response excludes credentials", !JSON.stringify(me).match(/passwordHash|tokenHash|password_hash/), Object.keys(me.data));
  const xssName = `${tag} <img src=x onerror=window.securityXss=1>`;
  const create = await api("companies", "POST", { displayName: xssName, sector: "Fixture", ownerId: operator.id, role: "owner", status: "won" }, operatorCookie);
  const created = await create.json();
  if (create.status !== 201) throw new Error(`Fixture company failed: ${create.status}`);
  companyIds.push(created.data.id);
  check("Mass assignment ignores undeclared status", created.data.status === "discovered", created.data.status);
  const injected = await (await api("companies?q=" + encodeURIComponent("' OR 1=1 --"), "GET", undefined, operatorCookie)).json();
  check("SQL injection string stays a search literal", Array.isArray(injected.data) && injected.data.length === 0, { rows: injected.data?.length, error: !!injected.error });
  const invalidUrl = await api("companies", "POST", { displayName: tag, sector: "Fixture", sourceUrl: "javascript:alert(1)", permittedBasis: "Synthetic test only" }, operatorCookie);
  check("Executable source URL rejected", invalidUrl.status === 400, invalidUrl.status);
  const preview = await api("companies/import", "POST", { csv: "nome,setor\nSynthetic,Fixture", mapping: { displayName: 0, sector: 1 }, ownerId: operator.id, sourceUrl: "https://example.invalid", permittedBasis: "Synthetic security assessment only", authorization: "authorized_import", requestKey: randomUUID() }, operatorCookie);
  const previewJson = await preview.json();
  if (preview.status !== 201) throw new Error(`Fixture preview failed: ${preview.status}`);
  batchIds.push(previewJson.data.id);
  for (const [label, cookie, expected] of [["other operator", otherCookie, 403], ["viewer", viewerCookie, 403], ["owner", ownerCookie, 200]] as const) {
    const r = await api(`companies/imports/${batchIds[0]}`, "GET", undefined, cookie); check(`Import isolation: ${label}`, r.status === expected, r.status);
  }
  for (const path of ["/.env", "/.git/config", "/package-lock.json", "/src/db/index.ts"]) {
    const r = await fetch(origin + path, { redirect: "manual" }); check(`Source/secret path ${path}`, r.status === 404, r.status); await r.body?.cancel();
  }
  const htmlResponse = await fetch(origin + "/companies", { headers: { cookie: operatorCookie } });
  observations.headers = Object.fromEntries(["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "cache-control", "strict-transport-security"].map(name => [name, htmlResponse.headers.get(name)]));
  check("CSP blocks framing and unauthorized scripts",/frame-ancestors 'none'/.test(htmlResponse.headers.get("content-security-policy")??"")&&/nonce-/.test(htmlResponse.headers.get("content-security-policy")??""),observations.headers);
  check("MIME sniffing disabled",htmlResponse.headers.get("x-content-type-options")==="nosniff",htmlResponse.headers.get("x-content-type-options"));
  await htmlResponse.body?.cancel();
  browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL ?? "msedge", headless: true });
  const context = await browser.newContext();
  await context.addCookies([{ name: "sales_session", value: operatorCookie.slice("sales_session=".length), domain: target.hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  attackerServer=createServer((_req,res)=>{res.writeHead(200,{"Content-Type":"text/html"});res.end(`<html><body><iframe style="width:1200px;height:800px" src="${origin}/companies"></iframe></body></html>`);});
  await new Promise<void>(resolve=>attackerServer!.listen(0,"127.0.0.1",resolve));
  const attacker = `http://127.0.0.1:${(attackerServer.address() as AddressInfo).port}`;
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === attacker) return route.continue();
    if(url.origin===origin&&url.searchParams.get("security_csp_attack")==="1"){
      const response=await route.fetch();const html=await response.text();
      return route.fulfill({response,body:html.replace("<head>","<head><script id=security-injected>window.securityInjectedScript=true</script>")});
    }
    if (url.origin === origin) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(origin + "/companies?q=" + encodeURIComponent(tag));
  await page.getByRole("link", { name: xssName + " →", exact: true }).waitFor();
  check("Stored HTML is rendered as inert text", await page.evaluate(() => !(window as unknown as { securityXss?: number }).securityXss) && await page.locator("img[onerror]").count() === 0, "Fixture text visible; no injected img or script flag");
  // Inject into the browser's response, not the database. Keep the server's real CSP.
  await page.goto(origin+"/companies?security_csp_attack=1");
  const injectedScriptCount=await page.locator("#security-injected").count();const executed=await page.evaluate(()=>(window as unknown as {securityInjectedScript?:boolean}).securityInjectedScript===true);
  check("CSP blocks a script without a nonce",injectedScriptCount===1&&!executed,{injectedScriptCount,executed});
  const nonce1=(await fetch(origin+"/login")).headers.get("content-security-policy"),nonce2=(await fetch(origin+"/login")).headers.get("content-security-policy");
  check("CSP nonce changes between documents",!!nonce1&&!!nonce2&&nonce1!==nonce2,"fresh per-response nonce");
  await page.goto(attacker);
  const frame = page.frameLocator("iframe");
  let framed = false;
  try { await frame.getByRole("heading", { name: "Empresas", exact: true }).waitFor({ timeout: 5000 }); framed = true; } catch { /* Record observed control rather than assume vulnerability. */ }
  observations.authenticatedFrameFromDifferentOrigin = framed;
  check("Page cannot be framed by another origin",!framed,framed);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/security-frame.png", fullPage: true });
  await browser.close(); browser = undefined;
  await new Promise<void>(resolve=>attackerServer!.close(()=>resolve()));attackerServer=undefined;
  const lockoutStatuses: number[] = [];
  for (let i = 0; i < 11; i++) lockoutStatuses.push((await api("auth/login", "POST", { email: victim.email, password: "wrong-fixture-password" })).status);
  observations.loginLockout = { wrongPasswordStatuses: lockoutStatuses, correctPasswordAfterAttack: (await api("auth/login", "POST", { email: victim.email, password })).status };
  observations.chunkedBody = await new Promise(resolve => {
    let uploadFinished = false;
    const req = request(origin + "/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json", "transfer-encoding": "chunked" } }, res => { const beforeEnd=!uploadFinished;res.resume(); res.on("end", () => resolve({ bytes: 71680, responseBeforeEnd: beforeEnd, status: res.statusCode })); });
    req.on("error", () => resolve({ error: "LOCAL_REQUEST_FAILED" }));
    req.setTimeout(10000, () => req.destroy());
    req.write("x".repeat(71680));
    setTimeout(() => { uploadFinished = true; req.end(); }, 500);
  });
  check("Chunked body rejected before upload finishes",(observations.chunkedBody as {status:number;responseBeforeEnd:boolean}).status===413&&(observations.chunkedBody as {responseBeforeEnd:boolean}).responseBeforeEnd,observations.chunkedBody);
  observations.databasePrivileges = (await pool.query("select rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname=current_user")).rows[0];
  // Do not disturb any existing daily usage. Stubbed extraction can never contact a provider.
  const day = new Date().toISOString().slice(0, 10);
  const existingUsage = await db.query.aiDailyUsage.findFirst({ where: eq(aiDailyUsage.day, day) });
  if (existingUsage) observations.aiQuota = { skipped: "Existing daily usage; preserve real state" };
  else {
    const fakeEnv = { AI_ENABLED: "true", AI_POLICY_APPROVED: "true", OPENAI_API_KEY: "fixture-only", OPENAI_MODEL: "fixture-only", OPENAI_INPUT_USD_PER_MILLION: "1", OPENAI_OUTPUT_USD_PER_MILLION: "2", AI_DAILY_BUDGET_USD: "1", AI_DAILY_REQUEST_LIMIT: "20" };
    const previous = Object.fromEntries(Object.keys(fakeEnv).map(key => [key, process.env[key]]));
    let calls = 0, errorStatus: unknown;
    try {
      Object.assign(process.env, fakeEnv);
      try { await conversationRoute(`activities/${randomUUID()}/extract-insights`, true, { version: 1, method: "openai", authorization: "authorize_openai" }, operator, async () => { calls++; throw new Error("PROVIDER_MUST_NOT_RUN"); }); }
      catch (error) { errorStatus = (error as { status?: number }).status; }
      const usage = await db.query.aiDailyUsage.findFirst({ where: eq(aiDailyUsage.day, day) });
      observations.aiQuota = { nonexistentActivityStatus: errorStatus, providerCalls: calls, requestsReserved: usage?.requests, reservedMicrousd: usage?.reservedMicrousd };
      check("Nonexistent activity cannot consume AI budget",errorStatus===404&&calls===0&&!usage?.requests,observations.aiQuota);
      const campaign=await db.query.campaigns.findFirst();if(!campaign)throw Error("Missing isolated seed campaign");
      const [person]=await db.insert(contacts).values({companyId:companyIds[0],name:"Synthetic AI fixture",nameNormalized:"synthetic ai fixture",title:"Sócio",roleCategory:"owner",sourceUrl:"https://example.invalid",permittedBasis:"Synthetic test only",purpose:"Isolated security assessment",createdBy:operator.id}).returning();
      const [deal]=await db.insert(opportunities).values({companyId:companyIds[0],campaignId:campaign.id,primaryContactId:person.id,ownerId:operator.id}).returning();
      const [message,note]=await db.insert(activities).values(["inbound_message","conversation_note"].map(kind=>({opportunityId:deal.id,contactId:person.id,kind,channel:"email",authorId:operator.id,authorRole:kind==="inbound_message"?"contact":"operator",body:"Conversa sintética para testar limites."}))).returning();
      const options={version:1,method:"openai",authorization:"authorize_openai"};
      const extractor=async()=>{calls++;return {candidates:[],usage:{model:"fixture-only",promptVersion:"fixture-only",inputTokens:1,outputTokens:1,estimatedMicrousd:1}};};
      for(const [label,id,version,expected] of [["stale version",message.id,2,409],["operator note",note.id,1,400]] as const){
        let status=0;try{await conversationRoute(`activities/${id}/extract-insights`,true,{...options,version},operator,extractor);}catch(e){status=(e as {status:number}).status;}
        const before=await db.query.aiDailyUsage.findFirst({where:eq(aiDailyUsage.day,day)});check(`AI quota rejects ${label} before reservation`,status===expected&&calls===0&&!before?.requests,{status,calls,requests:before?.requests??0});
      }
      const pair=await Promise.all([conversationRoute(`activities/${message.id}/extract-insights`,true,options,operator,extractor),conversationRoute(`activities/${message.id}/extract-insights`,true,options,operator,extractor)]);
      const results=await Promise.all(pair.map(r=>r!.json()));const after=await db.query.aiDailyUsage.findFirst({where:eq(aiDailyUsage.day,day)});
      check("Concurrent AI replay consumes one reservation and one provider call",calls===1&&after?.requests===1&&results[0].data.id===results[1].data.id,{calls,requests:after?.requests,sameRun:results[0].data.id===results[1].data.id});
    } finally {
      for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      await db.delete(aiDailyUsage).where(eq(aiDailyUsage.day, day));
    }
  }
  await securityMatrix(origin,api,check,{operator:operatorCookie,viewer:viewerCookie,owner:ownerCookie},companyIds[0]);
  await api("auth/logout", "POST", {}, operatorCookie);
  const replay = await api("me", "GET", undefined, operatorCookie);
  check("Logged-out token cannot be replayed", replay.status === 401, replay.status);
}
let failure: string | undefined;
main().catch(error => { failure = error instanceof Error ? error.message : "ASSESSMENT_FAILED"; process.exitCode = 1; }).finally(async () => {
  try {
    await browser?.close();
    if(attackerServer)await new Promise<void>(resolve=>attackerServer!.close(()=>resolve()));
    if (batchIds.length) await db.delete(companyImports).where(inArray(companyImports.id, batchIds));
    if (companyIds.length) {await db.delete(opportunities).where(inArray(opportunities.companyId,companyIds));await db.delete(contacts).where(inArray(contacts.companyId,companyIds));await db.delete(companies).where(inArray(companies.id, companyIds));}
    if (actors.length) {
      await db.delete(auditEvents).where(inArray(auditEvents.actorId, actors.map(a => a.id)));
      await db.delete(users).where(inArray(users.id, actors.map(a => a.id)));
    }
    if (attemptKeys.length) await db.delete(loginAttempts).where(inArray(loginAttempts.key, attemptKeys));
    observations.fixtureCleanup = "completed";
  } catch { observations.fixtureCleanup = "FAILED"; process.exitCode = 1; }
  await pool.end();
  const report = { executedAt: new Date().toISOString(), target: origin, checks, observations, ...(failure ? { failure } : {}) };
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/security-assessment.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({executedAt:report.executedAt,target:origin,total:checks.length,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed),observations,...(failure?{failure}:{})}, null, 2));
  if (checks.some(c => !c.passed)) process.exitCode = 1;
});
