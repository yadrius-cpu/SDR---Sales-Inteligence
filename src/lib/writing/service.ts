import { and,eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../db";
import { auditEvents,contacts,outreachDrafts,writingDailyUsage,writingRuns } from "../../db/schema";
import { hashToken,type Role } from "../security";
import { ResearchError } from "../research/contracts";
import { assertReachable } from "../outreach/contracts";
import { currentBasis,draftContext } from "../outreach/service";
import { generatedMessage,generateWriting,writingConfig,writingInput,writingPayload,writingPromptVersion,writingReservation } from "./provider";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function writableDraft(tx:Tx,id:string,version:number){
  const context=await draftContext(tx,id),{draft,company,opportunity}=context;
  const [contact]=await tx.select().from(contacts).where(eq(contacts.id,draft.contactId));
  assertReachable(contact,opportunity.stage);
  if(draft.sentConfirmedAt)throw new ResearchError("ALREADY_SENT","Crie outro rascunho para continuar a conversa; este já foi enviado.",409);
  if(draft.version!==version)throw new ResearchError("CONFLICT","O rascunho mudou. Recarregue antes de gerar outro texto.",409);
  await currentBasis(tx,draft,company.id);
  return {...context,contact};
}
function runResponse(run:typeof writingRuns.$inferSelect){
  if(run.status==="failed")return NextResponse.json({error:{code:run.errorCode,message:"Não foi possível aplicar a geração. O texto anterior foi preservado. Recarregue e revise a configuração, a base e os bloqueios antes de tentar novamente."},data:{runId:run.id,status:run.status}},{status:502});
  return NextResponse.json({data:{runId:run.id,status:run.status}},{status:run.status==="running"?202:200});
}
export async function writingRoute(path:string,write:boolean,body:unknown,user:{id:string;role:Role},generate:typeof generateWriting=generateWriting){
  const match=/^drafts\/([^/]+)\/generate-text$/.exec(path);if(!match||!write)return null;
  if(user.role==="viewer")throw new ResearchError("FORBIDDEN","Seu perfil permite apenas leitura.",403);
  const id=z.uuid().parse(match[1]),input=writingInput.parse(body),inputHash=hashToken(JSON.stringify(input));
  const prepared=await db.transaction(async tx=>{
    // Company lock serializes duplicate clicks and concurrent edits without holding a lock during HTTP.
    const {company}=await draftContext(tx,id);
    const [prior]=await tx.select().from(writingRuns).where(and(eq(writingRuns.draftId,id),eq(writingRuns.requestKey,input.requestKey)));
    if(prior){if(prior.inputHash!==inputHash)throw new ResearchError("REQUEST_CONFLICT","Esta solicitação já foi usada com outros dados. Recarregue a página.",409);return {prior};}
    const {draft,contact}=await writableDraft(tx,id,input.version);
    const config=writingConfig(input.provider);
    if(!config)throw new ResearchError("WRITING_DISABLED","Configure e habilite este provedor em Administração / IA antes de gerar textos.",409);
    const payload=writingPayload({recipient:contact.name,company:company.displayName,persona:draft.persona,channel:draft.channel,draft:draft.message,product:draft.productSnapshot,facts:draft.evidenceSnapshot.map(f=>({claim:f.claim,observedAt:f.observedAt}))},input);
    const reservation=writingReservation(config,payload),dayId=`${input.provider}:${new Date().toISOString().slice(0,10)}`;
    await tx.insert(writingDailyUsage).values({id:dayId}).onConflictDoNothing();
    const [usage]=await tx.select().from(writingDailyUsage).where(eq(writingDailyUsage.id,dayId)).for("update");
    if(usage.requests>=config.dailyLimit||usage.reservedMicrousd+reservation>config.dailyBudget*1000000)throw new ResearchError("WRITING_BUDGET","Limite diário de redação atingido para este provedor.",429);
    if(usage.lastRequestAt&&Date.now()-usage.lastRequestAt.getTime()<5000)throw new ResearchError("WRITING_RATE_LIMIT","Aguarde cinco segundos entre gerações neste provedor.",429);
    await tx.update(writingDailyUsage).set({requests:usage.requests+1,reservedMicrousd:usage.reservedMicrousd+reservation,lastRequestAt:new Date()}).where(eq(writingDailyUsage.id,dayId));
    const [run]=await tx.insert(writingRuns).values({draftId:id,requestKey:input.requestKey,inputHash,draftVersion:draft.version,provider:input.provider,model:config.model,promptVersion:writingPromptVersion,status:"running",createdBy:user.id,usage:{reservedMicrousd:reservation}}).returning();
    await tx.insert(auditEvents).values({actorId:user.id,entityType:"writing_run",entityId:run.id,action:"generation_requested",metadata:{companyId:company.id,provider:input.provider,model:config.model,draftId:id}});
    return {run,config,payload};
  });
  if(prepared.prior)return runResponse(prepared.prior);
  const {run,config,payload}=prepared;
  let result:Awaited<ReturnType<typeof generateWriting>>|undefined;
  try{
    result=await generate(payload,config);
    result.message=generatedMessage.parse(result.message);
    const completed=await db.transaction(async tx=>{
      const {draft,company}=await writableDraft(tx,id,input.version);
      await tx.update(outreachDrafts).set({message:result!.message,generation:{provider:input.provider,model:config.model,promptVersion:writingPromptVersion,runId:run.id,purpose:input.purpose},status:"draft",version:draft.version+1,approvedBy:null,approvedAt:null,copiedAt:null,editedBy:null,updatedAt:new Date()}).where(eq(outreachDrafts.id,id));
      const [saved]=await tx.update(writingRuns).set({status:"completed",usage:{...run.usage,...result!.usage},updatedAt:new Date()}).where(eq(writingRuns.id,run.id)).returning();
      await tx.insert(auditEvents).values({actorId:user.id,entityType:"outreach_draft",entityId:id,action:"ai_text_requires_review",metadata:{companyId:company.id,runId:run.id,version:draft.version+1,provider:input.provider}});
      return saved;
    });
    return runResponse(completed);
  }catch(error){
    const [failed]=await db.update(writingRuns).set({status:"failed",errorCode:error instanceof ResearchError?error.code:"WRITING_FAILED",usage:{...run.usage,...result?.usage},updatedAt:new Date()}).where(eq(writingRuns.id,run.id)).returning();
    return runResponse(failed);
  }
}
