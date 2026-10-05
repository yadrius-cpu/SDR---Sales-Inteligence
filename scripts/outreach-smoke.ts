import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and,eq,inArray,or,sql } from "drizzle-orm";
import { db,pool } from "../src/db";
import { activities,auditEvents,campaigns,companies,contacts,evidence,opportunities,outreachDrafts,products,sources,tasks } from "../src/db/schema";
const origin=process.env.APP_ORIGIN!;const cookies:string[]=[],ids:string[]=[],companyIds:string[]=[];let productId="",campaignId="";
async function call(path:string,method="GET",body?:unknown,cookie=""){return fetch(`${origin}/api/v1/${path}`,{method,headers:{origin,"Content-Type":"application/json",cookie},body:body===undefined?undefined:JSON.stringify(body)});}
async function result(path:string,body:unknown,cookie:string,status=200){const response=await call(path,"POST",body,cookie);const json=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(json.error??{})}`);if(json.data?.id)ids.push(json.data.id);return json.data;}
async function login(role:string){const response=await call("auth/login","POST",{email:`${role}@demo.invalid`,password:process.env.SEED_PASSWORD});assert.equal(response.status,200);const cookie=response.headers.get("set-cookie")!.split(";")[0];cookies.push(cookie);return cookie;}
async function main(){
  if(process.env.NODE_ENV==="production")throw new Error("Smoke apenas para desenvolvimento.");
  const owner=await login("owner"),operator=await login("operator"),viewer=await login("viewer");const actor=(await (await call("me","GET",undefined,operator)).json()).data;
  const [product]=await db.insert(products).values({name:`Produto fictício smoke ${randomUUID()}`,description:"Fixture de teste sem capacidades reais",approvedClaims:[],prohibitedClaims:["WhatsApp"]}).returning();productId=product.id;ids.push(productId);
  const [campaign]=await db.insert(campaigns).values({name:"Campanha fictícia smoke",sector:"Contabilidade",employeeMin:5,employeeMax:50,ownerId:actor.id,productId}).returning();campaignId=campaign.id;ids.push(campaignId);
  for(let i=0;i<2;i++){const c=await result("companies",{displayName:`Empresa smoke abordagem ${i}`,sector:"Contabilidade"},operator,201);companyIds.push(c.id);}
  const companyId=companyIds[0];const personInput={name:"Pessoa fictícia",title:"Sócio",roleCategory:"owner",professionalUrl:`https://www.linkedin.com/in/teste-${randomUUID()}`,sourceUrl:"https://example.invalid/permissao",permittedBasis:"Fixture fictícia para testes autorizados",purpose:"Teste interno de geração de abordagem"};
  assert.equal((await call(`companies/${companyId}/contacts`,"POST",personInput,viewer)).status,403);
  const contact=await result(`companies/${companyId}/contacts`,personInput,operator,201);
  assert.equal((await call(`companies/${companyId}/contacts`,"POST",{...personInput,name:" PESSOA   FICTÍCIA ",professionalUrl:""},operator)).status,409);
  assert.equal((await call(`companies/${companyIds[1]}/contacts`,"POST",{...personInput,name:"Outro nome",professionalUrl:`${personInput.professionalUrl}/?trk=x`},operator)).status,409);
  const second=await result(`companies/${companyId}/contacts`,{...personInput,name:"Segundo contato",professionalUrl:""},operator,201);
  const outside=await result(`companies/${companyIds[1]}/contacts`,{...personInput,name:"Contato de outra empresa",professionalUrl:""},operator,201);
  assert.equal((await call("opportunities","POST",{companyId,campaignId,primaryContactId:outside.id},operator)).status,400);
  const opportunity=await result("opportunities",{companyId,campaignId,primaryContactId:contact.id},operator,201);const path=`opportunities/${opportunity.id}`;
  assert.equal((await call(`${path}/drafts`,"POST",{contactId:outside.id,persona:"small_business"},operator)).status,400);
  let draft=await result(`${path}/drafts`,{contactId:contact.id,persona:"small_business"},operator,201);assert.equal(draft.isGeneric,true);assert.equal(draft.productSnapshot.approvedClaims.length,0);assert.doesNotMatch(draft.message,/WhatsApp/);
  assert.equal((await call(`drafts/${draft.id}/approve`,"POST",{version:1,attestation:"reviewed"},viewer)).status,403);
  assert.equal((await call(`drafts/${draft.id}/approve`,"POST",{version:1},operator)).status,400);
  assert.equal((await call(`drafts/${draft.id}/copy-content`,"POST",{version:1},operator)).status,409);
  const confirm={version:1,confirmation:"sent_manually",requestKey:randomUUID(),followUpDays:3};
  assert.equal((await call(`drafts/${draft.id}/confirm-sent`,"POST",confirm,operator)).status,409);
  draft=await result(`drafts/${draft.id}/approve`,{version:1,attestation:"reviewed"},operator);assert.equal(draft.status,"approved");assert.equal(draft.sentConfirmedAt,null);
  const content=await result(`drafts/${draft.id}/copy-content`,{version:1},operator);assert.equal(content.message,draft.message);
  draft=await result(`drafts/${draft.id}/copied`,{version:1},operator);assert.ok(draft.copiedAt);assert.equal(draft.sentConfirmedAt,null);
  let detail=(await (await call(path,"GET",undefined,operator)).json()).data;assert.equal(detail.opportunity.stage,"ready_for_review");assert.equal(detail.tasks.length,0);
  draft=await result(`drafts/${draft.id}/edit`,{version:1,message:draft.message+"\nObrigado pelo seu tempo."},operator);assert.equal(draft.status,"draft");assert.equal(draft.version,2);assert.equal(draft.copiedAt,null);assert.equal(draft.approvedAt,null);
  assert.equal((await call(`drafts/${draft.id}/approve`,"POST",{version:1,attestation:"reviewed"},operator)).status,409);
  draft=await result(`drafts/${draft.id}/approve`,{version:2,attestation:"reviewed"},operator);
  assert.equal((await call(`drafts/${draft.id}/confirm-sent`,"POST",{version:2,requestKey:confirm.requestKey},operator)).status,400);
  const sentBody={...confirm,version:2};const confirmations=await Promise.all([call(`drafts/${draft.id}/confirm-sent`,"POST",sentBody,operator),call(`drafts/${draft.id}/confirm-sent`,"POST",sentBody,operator)]);for(const r of confirmations)assert.equal(r.status,200);
  detail=(await (await call(path,"GET",undefined,viewer)).json()).data;assert.equal(detail.opportunity.stage,"contacted");assert.equal(detail.tasks.length,1);
  const sentEvents=await db.select().from(activities).where(and(eq(activities.draftId,draft.id),eq(activities.kind,"manual_sent_confirmed")));assert.equal(sentEvents.length,1);
  assert.equal((await call(`drafts/${draft.id}/confirm-sent`,"POST",{...sentBody,requestKey:randomUUID()},operator)).status,409);
  assert.equal((await call(`drafts/${draft.id}/edit`,"POST",{version:2,message:"Texto diferente já enviado"},operator)).status,409);
  const manualTask=await result(`${path}/tasks`,{contactId:second.id,assigneeId:actor.id,dueAt:"2027-01-01",description:"Revisar manualmente o próximo passo"},operator,201);
  await result(`tasks/${manualTask.id}/status`,{status:"done"},operator);
  const pending=await result(`${path}/drafts`,{contactId:contact.id,persona:"technical"},operator,201);
  const factInput={type:"public_fact",claim:"Possui uma página institucional fictícia",observedAt:"2026-01-01",sourceUrl:"https://example.invalid/fonte",publisher:"Fixture",permittedBasis:"Fonte fictícia autorizada para teste"};
  const fact=await result(`companies/${companyId}/evidence`,factInput,operator,201);
  assert.equal((await call(`${path}/drafts`,"POST",{contactId:second.id,persona:"technical",evidenceId:fact.id},operator)).status,400);
  await result(`companies/${companyId}/evidence/${fact.id}/review`,{version:1,status:"approved",note:"Fato fictício revisado no teste"},operator);
  const personalized=await result(`${path}/drafts`,{contactId:second.id,persona:"technical",evidenceId:fact.id},operator,201);assert.equal(personalized.isGeneric,false);assert.equal(personalized.evidenceSnapshot.length,1);
  await result(`drafts/${personalized.id}/approve`,{version:1,attestation:"reviewed"},operator);
  await result(`companies/${companyId}/evidence/${fact.id}/edit`,{...factInput,version:2,claim:"Fato corrigido no teste"},operator);
  assert.equal((await call(`drafts/${personalized.id}/copy-content`,"POST",{version:1},operator)).status,409);
  assert.equal((await call(`drafts/${personalized.id}/confirm-sent`,"POST",{...confirm,requestKey:randomUUID()},operator)).status,409);
  assert.equal((await call(`admin/products/${productId}/claims`,"POST",{version:1,approvedClaims:"Capacidade fictícia de teste",prohibitedClaims:"WhatsApp",attestation:"validated"},operator)).status,403);
  await result(`admin/products/${productId}/claims`,{version:1,approvedClaims:"Capacidade fictícia de teste",prohibitedClaims:"WhatsApp",attestation:"validated"},owner);
  assert.equal((await call(`drafts/${pending.id}/approve`,"POST",{version:1,attestation:"reviewed"},operator)).status,409);
  const capabilityDraft=await result(`${path}/drafts`,{contactId:contact.id,persona:"technical",claimIndex:0},operator,201);assert.match(capabilityDraft.message,/Capacidade fictícia de teste/);assert.equal(capabilityDraft.productVersion,2);
  await result(`drafts/${capabilityDraft.id}/approve`,{version:1,attestation:"reviewed"},operator);
  const unsentSecondary=await result(`${path}/drafts`,{contactId:second.id,persona:"small_business"},operator,201);
  for(const url of [`/companies/${companyId}/outreach`,`/opportunities/${opportunity.id}`,`/drafts/${capabilityDraft.id}`,"/outreach","/tasks","/admin/catalog"]){const response=await fetch(`${origin}${url}`,{headers:{cookie:owner}});assert.equal(response.status,200,url);assert.match(await response.text(),/PHISHSHIELD/);}
  const opt=await result(`contacts/${contact.id}/opt-out`,{confirmation:"do_not_contact"},operator);assert.ok(opt.doNotContactAt);
  detail=(await (await call(path,"GET",undefined,operator)).json()).data;assert.equal(detail.opportunity.stage,"do_not_contact");assert.equal(detail.tasks.filter((t:{status:string})=>t.status==="pending").length,0);assert.equal(detail.drafts.find((d:{id:string})=>d.id===unsentSecondary.id).status,"rejected");assert.ok(detail.drafts.find((d:{id:string})=>d.id===draft.id).sentConfirmedAt);
  for(const action of ["approve","copy-content","copied","confirm-sent"]){const r=await call(`drafts/${capabilityDraft.id}/${action}`,"POST",{...confirm,version:2,attestation:"reviewed",requestKey:randomUUID()},operator);assert.equal(r.status,409,action);}
  assert.equal((await call(`${path}/drafts`,"POST",{contactId:contact.id,persona:"technical"},operator)).status,409);
  assert.equal((await call(`${path}/tasks`,"POST",{contactId:contact.id,assigneeId:actor.id,dueAt:"2027-01-01",description:"Não deve ser criada"},operator)).status,409);
  assert.equal((await call(`companies/${companyId}/contacts`,"POST",personInput,operator)).status,409);
  assert.equal((await call("opportunities","POST",{companyId,campaignId,primaryContactId:contact.id},operator)).status,409);
  console.log("Smoke etapa 3 aprovado: contatos/dedupe, vínculo de oportunidade, templates, catálogo, evidências vigentes, RBAC, edição invalida aprovação, copiar não envia, confirmação explícita e concorrente idempotente, tarefa única, opt-out bloqueia abordagens/cancela tarefas, histórico preservado e 6 telas HTTP. Área de transferência não testada em navegador; nenhuma mensagem externa enviada.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  if(companyIds.length){await db.delete(auditEvents).where(or(inArray(auditEvents.entityId,ids),sql`${auditEvents.metadata}->>'companyId' in (${sql.join(companyIds.map(id=>sql`${id}`),sql`,`)})`));await db.delete(opportunities).where(inArray(opportunities.companyId,companyIds));await db.delete(contacts).where(inArray(contacts.companyId,companyIds));await db.delete(evidence).where(inArray(evidence.companyId,companyIds));await db.delete(sources).where(inArray(sources.companyId,companyIds));await db.delete(companies).where(inArray(companies.id,companyIds));}
  if(campaignId)await db.delete(campaigns).where(eq(campaigns.id,campaignId));if(productId)await db.delete(products).where(eq(products.id,productId));for(const cookie of cookies)await call("auth/logout","POST",{},cookie);await pool.end();
});
