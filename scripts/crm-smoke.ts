import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and,eq,inArray,or,sql } from "drizzle-orm";
import { db,pool } from "../src/db";
import { activities,auditEvents,campaigns,companies,companyImports,contacts,opportunities,outreachDrafts,tasks } from "../src/db/schema";
const origin=process.env.APP_ORIGIN!,prefix=`CRM fixture ${randomUUID()}`,ids:string[]=[],companyIds:string[]=[],batchIds:string[]=[],cookies:string[]=[];let campaignId="";
async function call(path:string,method="GET",body?:unknown,cookie=""){return fetch(`${origin}/api/v1/${path}`,{method,headers:{origin,"Content-Type":"application/json",cookie},body:body===undefined?undefined:JSON.stringify(body)});}
async function post(path:string,body:unknown,cookie:string,status=200){const response=await call(path,"POST",body,cookie),json=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(json.error??{})}`);if(json.data?.id)ids.push(json.data.id);return json.data;}
async function login(role:string){const r=await call("auth/login","POST",{email:`${role}@demo.invalid`,password:process.env.SEED_PASSWORD});assert.equal(r.status,200);const c=r.headers.get("set-cookie")!.split(";")[0];cookies.push(c);return c;}
async function main(){
  if(process.env.NODE_ENV==="production"||!["127.0.0.1","localhost"].includes(new URL(origin).hostname))throw new Error("Teste somente em desenvolvimento local.");
  const operator=await login("operator"),owner=await login("owner"),viewer=await login("viewer");const actor=(await (await call("me","GET",undefined,operator)).json()).data,ownerActor=(await (await call("me","GET",undefined,owner)).json()).data,viewerActor=(await (await call("me","GET",undefined,viewer)).json()).data;
  const product=(await (await call("products","GET",undefined,operator)).json()).data[0];
  const campaign=await post("campaigns",{name:prefix,productId:product.id,sector:"Contabilidade",employeeMin:5,employeeMax:50,ownerId:ownerActor.id,geography:"Brasil",targetRoles:"Sócio, Direção",inclusionCriteria:"Contabilidades com 5 a 50 funcionários",exclusionCriteria:"Fora do setor",status:"active"},operator,201);campaignId=campaign.id;
  assert.equal(campaign.ownerId,ownerActor.id);assert.equal(campaign.targetRoles.length,2);
  const existing=await post("companies",{displayName:`${prefix} existente`,sector:"Contabilidade",domain:`existing-${randomUUID()}.invalid`,ownerId:actor.id},operator,201);companyIds.push(existing.id);
  const csvRows=Array.from({length:20},(_,i)=>`${prefix} ${i},Contabilidade,${i===0?existing.domainNormalized:`c${i}-${campaignId}.invalid`},${i===19?"12ABC34501DE35":i===18?"123":""}`);csvRows[17]=csvRows[1];
  const input={csv:["nome,setor,dominio,cnpj",...csvRows].join("\n"),mapping:{displayName:0,sector:1,domain:2,cnpj:3},campaignId,ownerId:ownerActor.id,sourceUrl:"https://example.invalid/fixture",permittedBasis:"Dados fictícios autorizados apenas para teste",authorization:"authorized_import",requestKey:randomUUID()};
  await post("companies/import",input,viewer,403);
  const preview=await post("companies/import",input,operator,201);batchIds.push(preview.id);assert.equal(preview.rows.length,20);assert.equal(preview.rows[0].matches[0].id,existing.id);assert.ok(preview.rows[17].earlierLines.length);assert.ok(preview.rows[18].errors.length);
  assert.equal((await db.select().from(companies).where(sql`${companies.displayName} like ${prefix+"%"}`)).length,1);
  assert.equal((await post("companies/import",input,operator,201)).id,preview.id);
  const decisions=preview.rows.map((r:{line:number},i:number)=>({line:r.line,action:i===0?"link":i===17||i===18?"skip":"create",...(i===0?{companyId:existing.id}:{})}));
  const result=await post(`companies/imports/${preview.id}/commit`,{confirmation:"reviewed_import",decisions},operator);companyIds.push(...result.companyIds);assert.equal(result.created,17);assert.equal(result.linked,1);assert.equal(result.skipped,2);
  assert.deepEqual(await post(`companies/imports/${preview.id}/commit`,{confirmation:"reviewed_import",decisions},operator),result);
  await post(`companies/imports/${preview.id}/commit`,{confirmation:"reviewed_import",decisions:decisions.map((d:object)=>({...d,action:"skip"}))},operator,409);
  const alpha=(await db.select().from(companies).where(and(eq(companies.cnpj,"12ABC34501DE35"),eq(companies.ownerId,ownerActor.id))))[0];assert.ok(alpha);
  await post("companies",{displayName:`${prefix} duplicada`,sector:"Contabilidade",cnpj:"12.ABC.345/01DE-35",allowSharedDomain:true},operator,409);
  await post("companies",{displayName:`${prefix} inválida`,sector:"Contabilidade",cnpj:"123"},operator,400);
  // Revalidate at commit: a new conflicting company appears after preview; nothing from the batch is partially committed.
  const lateInput={...input,csv:`nome,setor,dominio,cnpj\n${prefix} seguro,Contabilidade,safe-${campaignId}.invalid,\n${prefix} conflito,Contabilidade,late-${campaignId}.invalid,`,requestKey:randomUUID()};
  const late=await post("companies/import",lateInput,operator,201);batchIds.push(late.id);
  const conflict=await post("companies",{displayName:`${prefix} novo cadastro concorrente`,sector:"Contabilidade",domain:`late-${campaignId}.invalid`},operator,201);companyIds.push(conflict.id);
  const lateDecisions=late.rows.map((r:{line:number})=>({line:r.line,action:"create"}));await post(`companies/imports/${late.id}/commit`,{confirmation:"reviewed_import",decisions:lateDecisions},operator,409);
  assert.equal((await db.select().from(companies).where(eq(companies.domainNormalized,`safe-${campaignId}.invalid`))).length,0);
  const refreshed=(await (await call(`companies/imports/${late.id}`,"GET",undefined,operator)).json()).data;assert.equal(refreshed.rows[1].matches[0].id,conflict.id);
  const corrected=await post(`companies/imports/${late.id}/commit`,{confirmation:"reviewed_import",decisions:[lateDecisions[0],{line:late.rows[1].line,action:"link",companyId:conflict.id}]},operator);companyIds.push(...corrected.companyIds);
  // Pagination with >50 persisted companies and stable filter totals.
  const more=await post("companies/import",{...input,csv:"nome,setor,dominio,cnpj\n"+Array.from({length:35},(_,i)=>`${prefix} adicional ${i},Contabilidade,more${i}-${campaignId}.invalid,`).join("\n"),requestKey:randomUUID()},operator,201);batchIds.push(more.id);
  const moreResult=await post(`companies/imports/${more.id}/commit`,{confirmation:"reviewed_import",decisions:more.rows.map((r:{line:number})=>({line:r.line,action:"create"}))},operator);companyIds.push(...moreResult.companyIds);
  const first=(await (await call(`companies?campaignId=${campaignId}`,"GET",undefined,viewer)).json());const second=(await (await call(`companies?campaignId=${campaignId}&page=2`,"GET",undefined,viewer)).json());assert.equal(first.data.length,50);assert.ok(second.data.length>0);assert.equal(first.pagination.total,second.pagination.total);assert.ok(!first.data.some((r:{id:string})=>second.data.some((s:{id:string})=>s.id===r.id)));
  const contact=await post(`companies/${existing.id}/contacts`,{name:"Pessoa de teste",title:"Sócio",roleCategory:"owner",sourceUrl:"https://example.invalid/fixture",purpose:"Teste local de CRM e pipeline",permittedBasis:"Contato fictício autorizado para teste"},operator,201);
  const o=await post("opportunities",{companyId:existing.id,campaignId,primaryContactId:contact.id,ownerId:ownerActor.id},operator,201);assert.equal(o.ownerId,ownerActor.id);
  const draft=await post(`opportunities/${o.id}/drafts`,{contactId:contact.id,persona:"small_business"},operator,201);await post(`drafts/${draft.id}/approve`,{version:1,attestation:"reviewed"},operator);
  const companyEdit={...existing,domain:existing.domainNormalized,cnpj:"",legalName:"",city:"São Paulo",state:"sp",employeeEstimate:12,sourceUrl:"",permittedBasis:"",displayName:`${prefix} nome corrigido`,ownerId:ownerActor.id};
  const edited=await post(`companies/${existing.id}/edit`,companyEdit,operator);assert.equal(edited.version,2);assert.equal(edited.state,"SP");await post(`companies/${existing.id}/edit`,companyEdit,operator,409);assert.equal((await db.query.outreachDrafts.findFirst({where:eq(outreachDrafts.id,draft.id)}))?.status,"draft");
  await post(`contacts/${contact.id}/edit`,{...contact,version:1,name:"Pessoa corrigida",professionalUrl:"",workEmail:""},operator);
  let current=(await (await call(`opportunities/${o.id}`,"GET",undefined,operator)).json()).data.opportunity;
  const stage={version:current.stageVersion,stage:"meeting",reason:"Reunião confirmada manualmente",confirmation:"reviewed_stage"};await post(`opportunities/${o.id}/stage`,stage,viewer,403);current=await post(`opportunities/${o.id}/stage`,stage,operator);await post(`opportunities/${o.id}/stage`,stage,operator,409);
  await post(`opportunities/${o.id}/owner`,{version:current.stageVersion,ownerId:viewerActor.id,reason:"Teste de responsável"},operator,400);current=await post(`opportunities/${o.id}/owner`,{version:current.stageVersion,ownerId:actor.id,reason:"Operador assumirá acompanhamento"},operator);
  await post(`opportunities/${o.id}/stage`,{...stage,version:current.stageVersion,stage:"contacted"},operator,400);current=await post(`opportunities/${o.id}/stage`,{...stage,version:current.stageVersion,stage:"contacted",contactConfirmation:"contacted_manually"},operator);
  await post(`opportunities/${o.id}/tasks`,{contactId:contact.id,assigneeId:actor.id,dueAt:"2030-01-01",description:"Lembrete fictício de revisão"},operator,201);
  await post(`opportunities/${o.id}/stage`,{...stage,version:current.stageVersion,stage:"won"},operator,400);current=await post(`opportunities/${o.id}/stage`,{...stage,version:current.stageVersion,stage:"won",wonConfirmation:"won_manually",wonReference:"Proposta fictícia aprovada em teste"},operator);assert.ok(current.wonAt);assert.equal((await db.query.tasks.findFirst({where:eq(tasks.opportunityId,o.id)}))?.status,"cancelled");assert.equal((await db.query.outreachDrafts.findFirst({where:eq(outreachDrafts.id,draft.id)}))?.status,"rejected");
  await post(`opportunities/${o.id}/stage`,{...stage,version:current.stageVersion},operator,409);
  const pipeline=(await (await call(`pipeline?campaignId=${campaignId}&stage=won`,"GET",undefined,viewer)).json());assert.equal(pipeline.pagination.total,1);assert.equal(pipeline.data[0].opportunity.id,o.id);
  assert.ok((await db.select().from(activities).where(and(eq(activities.opportunityId,o.id),eq(activities.kind,"owner_changed")))).length);
  const blocked=await post("opportunities",{companyId:existing.id,campaignId,primaryContactId:contact.id},operator,201);await post(`contacts/${contact.id}/opt-out`,{confirmation:"do_not_contact"},operator);const blockedStored=await db.query.opportunities.findFirst({where:eq(opportunities.id,blocked.id)});await post(`opportunities/${blocked.id}/stage`,{...stage,version:blockedStored!.stageVersion},operator,409);
  for(const url of ["/companies","/companies/import","/pipeline","/campaigns",`/companies/${existing.id}/manage`,`/contacts/${contact.id}`,`/opportunities/${o.id}/history`])assert.equal((await fetch(origin+url,{headers:{cookie:operator}})).status,200,url);
  console.log("Etapa 1 aprovada: CSV de 20 linhas com duplicatas/erro, prévia sem criar empresas, replay, conflito concorrente com rollback, correção, CNPJ numérico/alfanumérico, mais de 50 cadastros paginados, campanha/vínculos, edição, responsáveis, pipeline auditado, venda explícita, RBAC e opt-out.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(batchIds.length)await db.delete(companyImports).where(inArray(companyImports.id,batchIds));if(companyIds.length){await db.delete(auditEvents).where(or(inArray(auditEvents.entityId,[...ids,...batchIds]),sql`${auditEvents.metadata}->>'companyId' in (${sql.join([...new Set(companyIds)].map(id=>sql`${id}`),sql`,`)})`,eq(auditEvents.entityId,campaignId||randomUUID())));await db.delete(opportunities).where(inArray(opportunities.companyId,companyIds));await db.delete(contacts).where(inArray(contacts.companyId,companyIds));await db.delete(companies).where(inArray(companies.id,companyIds));}if(campaignId)await db.delete(campaigns).where(eq(campaigns.id,campaignId));for(const cookie of cookies)await call("auth/logout","POST",{},cookie);await pool.end();});
