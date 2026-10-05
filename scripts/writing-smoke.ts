import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq,inArray,or,sql } from "drizzle-orm";
import { db,pool } from "../src/db";
import { auditEvents,campaigns,companies,contacts,opportunities,outreachDrafts,tasks,users,writingDailyUsage,writingRuns } from "../src/db/schema";
import { outreachRoute } from "../src/lib/outreach/service";
import { writingRoute } from "../src/lib/writing/service";
import type { generateWriting } from "../src/lib/writing/provider";

let companyId="";const ids:string[]=[],envBefore:Record<string,string|undefined>={};
const day=new Date().toISOString().slice(0,10),usageIds=[`claude:${day}`,`openai:${day}`];let previousUsage:typeof writingDailyUsage.$inferSelect[]=[];
function setEnv(values:Record<string,string>){for(const [k,v] of Object.entries(values)){if(!(k in envBefore))envBefore[k]=process.env[k];process.env[k]=v;}}
async function main(){
  if(process.env.NODE_ENV==="production"||!["localhost","127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname))throw new Error("Teste somente com banco local de desenvolvimento.");
  const actor=await db.query.users.findFirst({where:eq(users.email,"operator@demo.invalid")});assert.ok(actor);
  const [company]=await db.insert(companies).values({displayName:"Redação — fixture fictícia",sector:"Contabilidade",ownerId:actor.id}).returning();companyId=company.id;
  async function sales(path:string,body:unknown){const response=await outreachRoute(path,true,body,actor!,null);assert.ok(response);return (await response.json()).data;}
  const contact=await sales(`companies/${companyId}/contacts`,{name:"Pessoa Fictícia",title:"Sócia",roleCategory:"owner",sourceUrl:"https://example.invalid/fixture",permittedBasis:"Registro fictício de teste local",purpose:"Teste dos controles de redação"});
  const campaign=await db.query.campaigns.findFirst();assert.ok(campaign);
  const opportunity=await sales("opportunities",{companyId,campaignId:campaign.id,primaryContactId:contact.id});
  const draft=await sales(`opportunities/${opportunity.id}/drafts`,{contactId:contact.id,persona:"small_business"});
  const path=`drafts/${draft.id}/generate-text`;
  let calls=0;
  const generated="Olá! Como vocês avaliam mensagens suspeitas no dia a dia?";
  const success:typeof generateWriting=async(payload,config)=>{calls++;assert.match(payload,/approvedClaims/);assert.equal(config.apiKey,"fixture-not-real");return {message:generated,usage:{inputTokens:10,outputTokens:15,estimatedMicrousd:40}};};
  const options={version:1,provider:"claude",purpose:"initial",authorization:"reviewed_and_authorized",requestKey:randomUUID()};
  await assert.rejects(()=>writingRoute(path,true,options,{...actor,role:"viewer"},success),/apenas leitura/);
  await assert.rejects(()=>writingRoute(path,true,{...options,authorization:undefined},actor,success));
  setEnv({CLAUDE_WRITING_ENABLED:"false"});await assert.rejects(()=>writingRoute(path,true,options,actor,success),/Configure/);assert.equal(calls,0);
  previousUsage=await db.select().from(writingDailyUsage).where(inArray(writingDailyUsage.id,usageIds));await db.delete(writingDailyUsage).where(inArray(writingDailyUsage.id,usageIds));
  setEnv({CLAUDE_WRITING_ENABLED:"true",CLAUDE_WRITING_POLICY_APPROVED:"true",ANTHROPIC_API_KEY:"fixture-not-real",CLAUDE_WRITING_MODEL:"fixture-claude",CLAUDE_WRITING_INPUT_USD_PER_MILLION:"1",CLAUDE_WRITING_OUTPUT_USD_PER_MILLION:"2",CLAUDE_WRITING_DAILY_BUDGET_USD:"0.000001",CLAUDE_WRITING_DAILY_REQUEST_LIMIT:"20"});
  await assert.rejects(()=>writingRoute(path,true,options,actor,success),/Limite diário/);assert.equal(calls,0);
  setEnv({CLAUDE_WRITING_DAILY_BUDGET_USD:"1"});
  await sales(`drafts/${draft.id}/approve`,{version:1,attestation:"reviewed"});await sales(`drafts/${draft.id}/copied`,{version:1});
  const first=await writingRoute(path,true,options,actor,success);assert.equal(first?.status,200);assert.equal(calls,1);
  const stored=await db.query.outreachDrafts.findFirst({where:eq(outreachDrafts.id,draft.id)});assert.equal(stored?.message,generated);assert.equal(stored?.version,2);assert.equal(stored?.status,"draft");assert.equal(stored?.approvedAt,null);assert.equal(stored?.copiedAt,null);assert.equal(stored?.generation?.provider,"claude");
  assert.equal((await writingRoute(path,true,options,actor,success))?.status,200);assert.equal(calls,1);
  await assert.rejects(()=>writingRoute(path,true,{...options,tone:"direct"},actor,success),/outros dados/);
  await assert.rejects(()=>sales(`drafts/${draft.id}/copy-content`,{version:2}),/Revise e aprove/);
  assert.equal((await db.select().from(tasks).where(eq(tasks.opportunityId,opportunity.id))).length,0);
  const next={...options,version:2,requestKey:randomUUID()};
  await assert.rejects(()=>writingRoute(path,true,next,actor,success),/cinco segundos/);
  await db.update(writingDailyUsage).set({lastRequestAt:null}).where(eq(writingDailyUsage.id,usageIds[0]));
  const failure=await writingRoute(path,true,next,actor,async()=>{calls++;throw new Error("provider secret detail");});assert.equal(failure?.status,502);const errorBody=await failure!.json();assert.doesNotMatch(JSON.stringify(errorBody),/provider secret detail/);
  assert.equal((await writingRoute(path,true,next,actor,success))?.status,502);assert.equal(calls,2);
  assert.equal((await db.query.outreachDrafts.findFirst({where:eq(outreachDrafts.id,draft.id)}))?.message,generated);
  const [reserved]=await db.select().from(writingDailyUsage).where(eq(writingDailyUsage.id,usageIds[0]));assert.equal(reserved.requests,2);assert.ok(reserved.reservedMicrousd>0);
  setEnv({OPENAI_WRITING_ENABLED:"true",OPENAI_WRITING_POLICY_APPROVED:"true",OPENAI_API_KEY:"fixture-not-real",OPENAI_WRITING_MODEL:"fixture-gpt",OPENAI_WRITING_INPUT_USD_PER_MILLION:"1",OPENAI_WRITING_OUTPUT_USD_PER_MILLION:"2",OPENAI_WRITING_DAILY_BUDGET_USD:"1",OPENAI_WRITING_DAILY_REQUEST_LIMIT:"20"});
  const gpt={...next,provider:"openai",purpose:"reply",context:"O contato perguntou quem pode conversar sobre o processo.",requestKey:randomUUID()};
  assert.equal((await writingRoute(path,true,gpt,actor,success))?.status,200);assert.equal(calls,3);
  const second=await db.query.outreachDrafts.findFirst({where:eq(outreachDrafts.id,draft.id)});assert.equal(second?.generation?.provider,"openai");assert.equal(second?.version,3);
  // Edit during HTTP: no open DB transaction holds the company lock, and the response cannot overwrite it.
  await db.update(writingDailyUsage).set({lastRequestAt:null}).where(eq(writingDailyUsage.id,usageIds[0]));
  const concurrent=await writingRoute(path,true,{...options,version:3,requestKey:randomUUID()},actor,async()=>{await sales(`drafts/${draft.id}/edit`,{version:3,message:"Texto revisado manualmente durante a geração."});return {message:"A IA não deve sobrescrever este texto.",usage:{inputTokens:10,outputTokens:15,estimatedMicrousd:40}};});assert.equal(concurrent?.status,502);
  assert.equal((await db.query.outreachDrafts.findFirst({where:eq(outreachDrafts.id,draft.id)}))?.message,"Texto revisado manualmente durante a geração.");
  // Duplicate concurrent requests invoke the provider once.
  await db.update(writingDailyUsage).set({lastRequestAt:null}).where(eq(writingDailyUsage.id,usageIds[0]));
  let release!:()=>void,started!:()=>void;const wait=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>started=r);
  const same={...options,version:4,requestKey:randomUUID()};
  const running=writingRoute(path,true,same,actor,async()=>{started();await wait;return {message:generated,usage:{inputTokens:10,outputTokens:15,estimatedMicrousd:40}};});
  await entered;try{assert.equal((await writingRoute(path,true,same,actor,async()=>{throw new Error("duplicate provider call");}))?.status,202);}finally{release();}
  assert.equal((await running)?.status,200);
  // Opt-out while provider works discards its output and preserves the block.
  await db.update(writingDailyUsage).set({lastRequestAt:null}).where(eq(writingDailyUsage.id,usageIds[0]));
  const blocked=await writingRoute(path,true,{...options,version:5,requestKey:randomUUID()},actor,async()=>{await sales(`contacts/${contact.id}/opt-out`,{confirmation:"do_not_contact"});return {message:"Não pode ser aplicado após opt-out.",usage:{inputTokens:10,outputTokens:15,estimatedMicrousd:40}};});assert.equal(blocked?.status,502);
  const final=await db.query.outreachDrafts.findFirst({where:eq(outreachDrafts.id,draft.id)});assert.equal(final?.status,"rejected");assert.equal(final?.message,generated);
  const runs=await db.select().from(writingRuns).where(eq(writingRuns.draftId,draft.id));ids.push(...runs.map(r=>r.id));assert.equal(runs.length,6);assert.equal(runs.filter(r=>r.status==="completed").length,3);
  console.log("Redação aprovada: Claude/GPT simulados, revisão obrigatória, RBAC, autorização, orçamento, limite de frequência, replay, falha preserva texto, edição concorrente e opt-out. Nenhuma chamada externa.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  for(const [k,v] of Object.entries(envBefore)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  if(companyId){await db.delete(auditEvents).where(or(inArray(auditEvents.entityId,ids),sql`${auditEvents.metadata}->>'companyId' = ${companyId}`));await db.delete(opportunities).where(eq(opportunities.companyId,companyId));await db.delete(contacts).where(eq(contacts.companyId,companyId));await db.delete(companies).where(eq(companies.id,companyId));}
  if("CLAUDE_WRITING_POLICY_APPROVED" in envBefore){await db.delete(writingDailyUsage).where(inArray(writingDailyUsage.id,usageIds));if(previousUsage.length)await db.insert(writingDailyUsage).values(previousUsage);}
  await pool.end();
});
