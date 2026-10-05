import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, type Browser } from "playwright";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { activities, auditEvents, campaigns, companies, contacts, conversationInsights, experimentMembers, experiments, opportunities } from "../src/db/schema";
import { DAY } from "../src/lib/analytics/contracts";

const origin=process.env.APP_ORIGIN!, prefix=`Analytics fixture ${randomUUID()}`;
const companyIds:string[]=[], entityIds:string[]=[], experimentIds:string[]=[], cookies:string[]=[];
let campaignId="",browser:Browser|undefined;
async function call(path:string,method="GET",body?:unknown,cookie="",expected=200) {
  const r=await fetch(`${origin}/api/v1/${path}`,{method,headers:{origin,"Content-Type":"application/json",cookie},body:body===undefined?undefined:JSON.stringify(body)});
  const json=await r.json();assert.equal(r.status,expected,`${path}: ${JSON.stringify(json.error??{})}`);if(json.data?.id)entityIds.push(json.data.id);return json.data;
}
async function login(role:string) {
  const r=await fetch(`${origin}/api/v1/auth/login`,{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify({email:`${role}@demo.invalid`,password:process.env.SEED_PASSWORD})});
  assert.equal(r.status,200);const cookie=r.headers.get("set-cookie")!.split(";")[0];cookies.push(cookie);return cookie;
}
async function main() {
  if(process.env.NODE_ENV==="production"||!["127.0.0.1","localhost"].includes(new URL(origin).hostname))throw Error("Teste somente local.");
  const operator=await login("operator"), viewer=await login("viewer"), actor=await call("me","GET",undefined,operator);
  const [product]=await call("products","GET",undefined,operator);
  const campaign=await call("campaigns","POST",{name:prefix,productId:product.id,sector:"Contabilidade",employeeMin:5,employeeMax:50},operator,201);campaignId=campaign.id;
  const deals: {id:string;primaryContactId:string;companyId:string}[]=[];
  for(let i=0;i<4;i++) {
    const company=await call("companies","POST",{displayName:`${prefix} ${i}`,sector:i===2?"Tecnologia":"Contabilidade"},operator,201);companyIds.push(company.id);
    const contact=await call(`companies/${company.id}/contacts`,"POST",{name:`Pessoa fictícia ${i}`,title:"Sócio",roleCategory:"owner",sourceUrl:"https://example.invalid/fixture",purpose:"Validação local da etapa cinco",permittedBasis:"Dados fictícios autorizados para teste"},operator,201);
    deals.push(await call("opportunities","POST",{companyId:company.id,campaignId,primaryContactId:contact.id},operator,201));
  }
  const protocol={requestKey:randomUUID(),name:prefix,hypothesis:"Uma pergunta curta aumenta a resposta recebida",variantA:"Pergunta curta sobre treinamento",variantB:"Pergunta longa sobre treinamento",campaignId,metric:"replied",windowDays:14,minPerArm:30,enrollmentEnds:new Date(Date.now()+7*DAY).toISOString().slice(0,10),confirmation:"predefined_protocol"};
  await call("analytics","GET",undefined,"",401);
  await call("analytics?from=2026-10-01&to=2026-09-01","GET",undefined,viewer,400);
  await call("experiments","POST",protocol,viewer,403);
  const noOrigin=await fetch(`${origin}/api/v1/experiments`,{method:"POST",headers:{cookie:operator,"Content-Type":"application/json"},body:JSON.stringify(protocol)});assert.equal(noOrigin.status,403);
  const experiment=await call("experiments","POST",protocol,operator,201);experimentIds.push(experiment.id);
  assert.equal((await call("experiments","POST",protocol,operator,201)).id,experiment.id);
  await call("experiments","POST",{...protocol,name:"Protocolo alterado"},operator,409);
  const enroll=(id:string)=>call(`experiments/${experiment.id}/enroll`,"POST",{opportunityId:id,confirmation:"eligible_before_contact"},operator);
  const concurrent=await Promise.all([enroll(deals[0].id),enroll(deals[0].id)]);assert.equal(concurrent[0].id,concurrent[1].id);assert.equal(concurrent[0].arm,concurrent[1].arm);
  await enroll(deals[1].id);
  // Mature one participant in each group. Time travel only these fictitious rows.
  const enrolledAt=new Date(Date.now()-15*DAY);
  await db.update(experimentMembers).set({createdAt:enrolledAt,arm:"A"}).where(eq(experimentMembers.opportunityId,deals[0].id));
  await db.update(experimentMembers).set({createdAt:enrolledAt,arm:"B"}).where(eq(experimentMembers.opportunityId,deals[1].id));
  const [message]=await db.insert(activities).values({opportunityId:deals[0].id,contactId:deals[0].primaryContactId,kind:"inbound_message",channel:"email",authorId:actor.id,authorRole:"contact",body:"Falta tempo para treinamento",happenedAt:new Date(+enrolledAt+DAY),createdAt:new Date(+enrolledAt+DAY)}).returning();entityIds.push(message.id);
  await db.insert(activities).values({opportunityId:deals[0].id,kind:"inbound_message",channel:"email",authorId:actor.id,happenedAt:new Date(+enrolledAt+2*DAY),createdAt:new Date(+enrolledAt+2*DAY)});
  const [signal]=await db.insert(conversationInsights).values({activityId:message.id,activityVersion:1,kind:"pain",normalizedLabel:"Falta tempo",rawExcerpt:"Falta tempo",certainty:"explicit",method:"manual",fingerprint:randomUUID()}).returning();
  const today=new Date().toISOString().slice(0,10), query=`analytics?campaignId=${campaignId}&from=${today}&to=${today}`;
  let result=await call(query,"GET",undefined,viewer);assert.equal(result.total,4);assert.equal(result.respondents,1);assert.equal(result.themes.length,0);
  await db.update(conversationInsights).set({status:"approved",reviewedBy:actor.id,reviewedAt:new Date()}).where(eq(conversationInsights.id,signal.id));
  result=await call(query,"GET",undefined,viewer);assert.equal(result.themes.length,1);assert.equal(result.themes[0].count,1);assert.equal(result.themes[0].denominator,3);assert.equal(result.themes[0].respondentCount,1);
  await db.update(activities).set({version:2}).where(eq(activities.id,message.id));assert.equal((await call(query,"GET",undefined,viewer)).themes.length,0);
  await db.update(activities).set({version:1}).where(eq(activities.id,message.id));
  assert.equal((await call(query+"&sector=Tecnologia","GET",undefined,viewer)).total,1);
  await db.update(opportunities).set({createdAt:new Date("2020-01-01T00:00:00Z")}).where(eq(opportunities.id,deals[2].id));
  assert.equal((await call(query,"GET",undefined,viewer)).total,3);
  await call(`opportunities/${deals[1].id}/stage`,"POST",{stage:"lost",version:1,reason:"Sem orçamento neste período",confirmation:"reviewed_stage"},operator);
  result=await call(query,"GET",undefined,viewer);assert.equal(result.losses[0].count,1);assert.equal(result.stages.reduce((n:number,s:{count:number})=>n+s.count,0),result.total);
  const comparison=await call(`experiments/${experiment.id}`,"GET",undefined,viewer);
  assert.equal(comparison.arms[0].successes,1);assert.equal(comparison.arms[0].denominator,1);assert.equal(comparison.arms[1].successes,0);assert.equal(comparison.arms[1].denominator,1);assert.match(comparison.assessment,/insuficiente/);
  await call(`opportunities/${deals[2].id}/stage`,"POST",{stage:"contacted",version:1,reason:"Contato fictício confirmado",confirmation:"reviewed_stage",contactConfirmation:"contacted_manually"},operator);
  await call(`experiments/${experiment.id}/enroll`,"POST",{opportunityId:deals[2].id,confirmation:"eligible_before_contact"},operator,409);
  // Real browser: filters, protocol form, assignment form, viewer restrictions, mobile layout.
  browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL??"msedge",headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}), external:string[]=[],errors:string[]=[];
  await context.addCookies([{name:operator.split("=")[0],value:operator.slice(operator.indexOf("=")+1),url:origin}]);
  await context.route("**/*",route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`${origin}/analytics?campaignId=${campaignId}`);await page.getByRole("heading",{name:"Insights e experimentos",exact:true}).waitFor();
  await page.getByLabel("Segmento (setor atual)").selectOption("Tecnologia");await page.getByRole("button",{name:"Aplicar filtros"}).click();await page.waitForURL(/sector=Tecnologia/);
  await page.goto(`${origin}/analytics?campaignId=${campaignId}`);await mkdir("test-results",{recursive:true});await page.screenshot({path:"test-results/etapa-5-insights-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:"test-results/etapa-5-insights-mobile.png",fullPage:true});
  await page.goto(origin+"/experiments");await page.getByLabel("Nome",{exact:true}).fill(prefix+" UI");await page.locator('select[name="campaignId"]').selectOption(campaignId);await page.getByLabel("Hipótese",{exact:true}).fill(protocol.hypothesis);await page.getByLabel("Abordagem A",{exact:true}).fill(protocol.variantA);await page.getByLabel("Abordagem B",{exact:true}).fill(protocol.variantB);await page.getByLabel("Último dia para inscrições (UTC)").fill(protocol.enrollmentEnds);await page.getByLabel(/Defini as variantes/).check();
  const saved=page.waitForResponse(r=>r.url().endsWith("/api/v1/experiments")&&r.request().method()==="POST");await page.getByRole("button",{name:"Salvar protocolo"}).click();const response=await saved;assert.equal(response.status(),201);const created=(await response.json()).data;experimentIds.push(created.id);entityIds.push(created.id);
  await page.goto(`${origin}/experiments/${created.id}`);await page.locator('select[name="opportunityId"]').selectOption(deals[3].id);await page.getByLabel(/Esta oportunidade ainda/).check();
  const assignment=page.waitForResponse(r=>r.url().endsWith(`/experiments/${created.id}/enroll`));await page.getByRole("button",{name:"Inscrever e sortear"}).click();assert.equal((await assignment).status(),200);await page.reload();assert.equal(await page.locator("tbody").last().locator("tr").count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:"test-results/etapa-5-experimento-mobile.png",fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.goto(`${origin}/experiments/${experiment.id}`);await page.screenshot({path:"test-results/etapa-5-experimento-desktop.png",fullPage:true});
  await context.addCookies([{name:viewer.split("=")[0],value:viewer.slice(viewer.indexOf("=")+1),url:origin}]);await page.reload();assert.equal(await page.getByRole("button",{name:"Inscrever e sortear"}).count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log("Etapa 5 aprovada: API/PostgreSQL, denominadores, filtros, revisão, janelas, idempotência concorrente, permissões, origem, protocolo/sorteio no Edge e layouts desktop/móvel; sem chamadas externas.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  await browser?.close();
  if(experimentIds.length){const members=await db.select({id:experimentMembers.id}).from(experimentMembers).where(inArray(experimentMembers.experimentId,experimentIds));entityIds.push(...members.map(m=>m.id));await db.delete(experiments).where(inArray(experiments.id,experimentIds));}
  if(companyIds.length){await db.delete(opportunities).where(inArray(opportunities.companyId,companyIds));await db.delete(contacts).where(inArray(contacts.companyId,companyIds));await db.delete(companies).where(inArray(companies.id,companyIds));}
  if(campaignId)await db.delete(campaigns).where(eq(campaigns.id,campaignId));
  if(entityIds.length)await db.delete(auditEvents).where(or(inArray(auditEvents.entityId,entityIds),companyIds.length?sql`${auditEvents.metadata}->>'companyId' in (${sql.join(companyIds.map(id=>sql`${id}`),sql`,`)})`:undefined));
  for(const cookie of cookies)await call("auth/logout","POST",{},cookie).catch(()=>{});
  await pool.end();
});
