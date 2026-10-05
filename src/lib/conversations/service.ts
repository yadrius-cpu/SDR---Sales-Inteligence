import { moveStage } from "../crm/pipeline";
import { and,desc,eq,inArray,isNull,or,sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../db";
import { activities,aiDailyUsage,auditEvents,companies,contacts,conversationInsights,evidence,extractionRuns,opportunities,outreachDrafts,researchBriefs,tasks } from "../../db/schema";
import { hashToken,type Role } from "../security";
import { ResearchError } from "../research/contracts";
import { activityInput,containsExcerpt,conversationBody,insightInput,maskSensitive,reviewInsightInput } from "./contracts";
import { localExtractor,validateCandidates } from "./extractor";
import { extractWithOpenAI,openAIConfig,promptVersion,reservationMicrousd } from "./openai";
import { suggestNextAction } from "./next-action";
type Actor={id:string;role:Role};type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockOpportunity(tx:Tx,id:string){const [initial]=await tx.select().from(opportunities).where(eq(opportunities.id,id));if(!initial)throw new ResearchError("NOT_FOUND","Oportunidade não encontrada.",404);await tx.select().from(companies).where(eq(companies.id,initial.companyId)).for("update");const [row]=await tx.select().from(opportunities).where(eq(opportunities.id,id));return row;}
async function lockActivity(tx:Tx,id:string){const [initial]=await tx.select().from(activities).where(eq(activities.id,id));if(!initial)throw new ResearchError("NOT_FOUND","Atividade não encontrada.",404);const opportunity=await lockOpportunity(tx,initial.opportunityId);const [activity]=await tx.select().from(activities).where(eq(activities.id,id));if(activity.deletedAt||!activity.body)throw new ResearchError("NO_CONTENT","Esta atividade não contém conversa disponível.",409);return {activity,opportunity};}
function audit(tx:Tx,user:Actor,entityType:string,entityId:string,action:string,companyId:string){return tx.insert(auditEvents).values({actorId:user.id,entityType,entityId,action,metadata:{companyId}});}
async function invalidateBriefs(tx:Tx,companyId:string){await tx.update(researchBriefs).set({status:"pending",reviewedBy:null,reviewedAt:null}).where(and(eq(researchBriefs.companyId,companyId),eq(researchBriefs.status,"approved")));}
async function clearDerived(tx:Tx,activityId:string,companyId:string){
  const derived=await tx.select({id:evidence.id}).from(evidence).where(eq(evidence.activityId,activityId));const ids=derived.map(e=>e.id);
  const links=await tx.select().from(conversationInsights).where(eq(conversationInsights.activityId,activityId));
  for(const link of links){if(link.contradictedEvidenceId&&link.contradictedVersion)await tx.update(evidence).set({status:"pending",reviewedBy:null,reviewedAt:null,reviewNote:"A conversa de apoio foi alterada ou apagada; revisar novamente.",version:sql`${evidence.version}+1`,updatedAt:new Date()}).where(and(eq(evidence.id,link.contradictedEvidenceId),eq(evidence.version,link.contradictedVersion)));}
  if(ids.length){const briefs=await tx.select().from(researchBriefs).where(eq(researchBriefs.companyId,companyId));const remove=briefs.filter(b=>b.evidenceSnapshot.some(e=>ids.includes(e.id))).map(b=>b.id);if(remove.length)await tx.delete(researchBriefs).where(inArray(researchBriefs.id,remove));}
  await tx.delete(conversationInsights).where(eq(conversationInsights.activityId,activityId));await tx.delete(evidence).where(eq(evidence.activityId,activityId));await invalidateBriefs(tx,companyId);
}
export async function getConversation(id:string){
  const opportunity=await db.query.opportunities.findFirst({where:eq(opportunities.id,id)});if(!opportunity)throw new ResearchError("NOT_FOUND","Oportunidade não encontrada.",404);
  const [messages,insights,people,runs]=await Promise.all([db.select().from(activities).where(and(eq(activities.opportunityId,id),inArray(activities.kind,["inbound_message","outbound_note","conversation_note"]))).orderBy(desc(activities.happenedAt),activities.id),db.select({i:conversationInsights,a:activities}).from(conversationInsights).innerJoin(activities,eq(conversationInsights.activityId,activities.id)).where(eq(activities.opportunityId,id)).orderBy(desc(conversationInsights.createdAt)),db.select().from(contacts).where(eq(contacts.companyId,opportunity.companyId)),db.select({r:extractionRuns}).from(extractionRuns).innerJoin(activities,eq(extractionRuns.activityId,activities.id)).where(eq(activities.opportunityId,id)).orderBy(desc(extractionRuns.createdAt))]);
  const primary=people.find(c=>c.id===opportunity.primaryContactId);const nextAction=suggestNextAction(opportunity.stage,opportunity.primaryContactId,!!primary?.doNotContactAt,insights.map(({i,a})=>({...i,currentActivityVersion:a.version,deleted:!!a.deletedAt,contactId:a.contactId})));
  return {opportunity,messages,insights:insights.map(({i})=>i),contacts:people,runs:runs.map(({r})=>r),nextAction};
}
async function reserveAI(tx:Tx,config:NonNullable<ReturnType<typeof openAIConfig>>){const day=new Date().toISOString().slice(0,10),amount=reservationMicrousd(config);
  await tx.insert(aiDailyUsage).values({day}).onConflictDoNothing();const [usage]=await tx.select().from(aiDailyUsage).where(eq(aiDailyUsage.day,day)).for("update");
  if(usage.requests>=config.AI_DAILY_REQUEST_LIMIT||usage.reservedMicrousd+amount>config.AI_DAILY_BUDGET_USD*1000000)throw new ResearchError("AI_BUDGET_LIMIT","Limite diário de IA atingido. Use o registro manual.",429);
  if(usage.lastRequestAt&&Date.now()-usage.lastRequestAt.getTime()<5000)throw new ResearchError("AI_RATE_LIMIT","Aguarde 5 segundos entre análises de IA.",429);
  await tx.update(aiDailyUsage).set({requests:usage.requests+1,reservedMicrousd:usage.reservedMicrousd+amount,lastRequestAt:new Date()}).where(eq(aiDailyUsage.day,day));
}
export async function conversationRoute(path:string,write:boolean,body:unknown,user:Actor,aiExtract:typeof extractWithOpenAI=extractWithOpenAI){
  if(!/^(activities(?:\/|$)|conversation-insights\/|opportunities\/[^/]+\/(conversation|next-action|conversation-stage)$)/.test(path))return null;
  if(write&&user.role==="viewer")throw new ResearchError("FORBIDDEN","Seu perfil permite apenas leitura.",403);
  const conversation=/^opportunities\/([^/]+)\/(conversation|next-action|conversation-stage)$/.exec(path);
  if(conversation){const id=z.uuid().parse(conversation[1]);if(!write){const data=await getConversation(id);return NextResponse.json({data:conversation[2]==="next-action"?data.nextAction:data});}
    if(conversation[2]==="conversation-stage"){
      const input=z.object({stage:z.enum(["replied","discovery","meeting","trial","negotiation","lost","follow_up_later","no_response"]),version:z.coerce.number().int().positive(),reason:z.string().trim().min(5).max(1000),confirmation:z.literal("reviewed_stage")}).parse(body);
      const row=await moveStage(id,input,user);return NextResponse.json({data:row});
    }return null;
  }
  if(path==="activities"&&write){const input=activityInput.parse(body);const sanitized=maskSensitive(input.body);const fingerprint=hashToken(JSON.stringify({...input,body:sanitized,requestKey:undefined}));
    const row=await db.transaction(async tx=>{const o=await lockOpportunity(tx,input.opportunityId);const [contact]=await tx.select().from(contacts).where(and(eq(contacts.id,input.contactId),eq(contacts.companyId,o.companyId)));if(!contact)throw new ResearchError("INVALID_CONTACT","Contato não pertence à empresa.",400);const [existing]=await tx.select().from(activities).where(and(eq(activities.opportunityId,o.id),eq(activities.requestKey,input.requestKey)));if(existing){if(existing.contentHash!==fingerprint)throw new ResearchError("CONFLICT","Chave já usada para outro conteúdo.",409);return existing;}
      const [created]=await tx.insert(activities).values({opportunityId:o.id,contactId:contact.id,kind:input.kind,channel:input.channel,body:sanitized,happenedAt:input.happenedAt,permittedBasis:maskSensitive(input.permittedBasis),requestKey:input.requestKey,contentHash:fingerprint,authorId:user.id,authorRole:input.kind==="inbound_message"?"contact":"operator"}).returning();await audit(tx,user,"activity",created.id,"conversation_recorded",o.companyId);return created;});return NextResponse.json({data:row},{status:201});
  }
  const activityMatch=/^activities\/([^/]+)\/(edit|erase|insights|extract-insights)$/.exec(path);
  if(activityMatch&&write){const id=z.uuid().parse(activityMatch[1]),action=activityMatch[2];
    if(action==="edit"||action==="erase"){
      const input=z.object({version:z.coerce.number().int().positive(),confirmation:z.enum(["authorized_and_redacted","erase_content"]),body:conversationBody.optional()}).parse(body);
      if((action==="edit"&&(!input.body||input.confirmation!=="authorized_and_redacted"))||(action==="erase"&&input.confirmation!=="erase_content"))throw new ResearchError("CONFIRMATION_REQUIRED","Confirme a operação solicitada.",400);
      const row=await db.transaction(async tx=>{const {activity:a,opportunity:o}=await lockActivity(tx,id);if(a.version!==input.version)throw new ResearchError("CONFLICT","A conversa mudou. Recarregue.",409);await clearDerived(tx,id,o.companyId);const sanitized=action==="edit"?maskSensitive(input.body!):null;const [updated]=await tx.update(activities).set({body:sanitized,permittedBasis:action==="erase"?null:a.permittedBasis,version:a.version+1,deletedAt:action==="erase"?new Date():null,updatedAt:new Date()}).where(eq(activities.id,id)).returning();await audit(tx,user,"activity",id,action==="edit"?"conversation_corrected":"conversation_erased",o.companyId);return updated;});return NextResponse.json({data:row});
    }
    if(action==="insights"){
      const input=insightInput.parse(body);const activityVersion=z.object({activityVersion:z.coerce.number().int().positive()}).parse(body).activityVersion;
      const row=await db.transaction(async tx=>{const {activity:a,opportunity:o}=await lockActivity(tx,id);if(a.version!==activityVersion)throw new ResearchError("CONFLICT","A conversa mudou. Recarregue.",409);if(a.authorRole!=="contact")throw new ResearchError("NOT_CONTACT_MESSAGE","Insights do contato exigem mensagem recebida; notas do operador não são declarações do contato.",400);if(!containsExcerpt(a.body!,input.rawExcerpt))throw new ResearchError("INVALID_EXCERPT","O trecho precisa existir literalmente na mensagem salva.",400);const fingerprint=hashToken(JSON.stringify(input));const [created]=await tx.insert(conversationInsights).values({...input,normalizedLabel:maskSensitive(input.normalizedLabel),activityId:id,activityVersion:a.version,method:"manual",fingerprint}).onConflictDoNothing().returning();if(!created)throw new ResearchError("DUPLICATE_INSIGHT","Este insight já foi registrado.",409);await audit(tx,user,"conversation_insight",created.id,"created_pending_review",o.companyId);return created;});return NextResponse.json({data:row},{status:201});
    }
    const input=z.object({version:z.coerce.number().int().positive(),method:z.enum(["local","openai"]).default("local"),authorization:z.string().optional(),retry:z.enum(["true","false"]).default("false")}).parse(body);
    const config=input.method==="openai"?openAIConfig():null;
    if(input.method==="openai"&&(!config||input.authorization!=="authorize_openai"))throw new ResearchError("AI_NOT_READY","Configure a OpenAI, aprove a política e autorize explicitamente esta análise.",409);
    const method=input.method==="openai"?`openai:${config!.OPENAI_MODEL}:${promptVersion}`:localExtractor.method;
    const run=await db.transaction(async tx=>{const {activity:a,opportunity:o}=await lockActivity(tx,id);if(a.version!==input.version)throw new ResearchError("CONFLICT","A conversa mudou. Recarregue.",409);if(a.authorRole!=="contact")throw new ResearchError("NOT_CONTACT_MESSAGE","Selecione uma mensagem recebida do contato.",400);
      const [prior]=await tx.select().from(extractionRuns).where(and(eq(extractionRuns.activityId,id),eq(extractionRuns.activityVersion,a.version),eq(extractionRuns.method,method)));if(prior&&(prior.status!=="failed"||input.retry!=="true"))return prior;
      if(config)await reserveAI(tx,config);
      let candidates:ReturnType<typeof validateCandidates>=[],errorCode:string|null=null,usage:Record<string,unknown>={provider:input.method,promptVersion:input.method==="openai"?promptVersion:null};
      try{const result=config?await aiExtract(a.body!,config):{candidates:await localExtractor.extract(a.body!),usage:{}};candidates=validateCandidates(a.body!,result.candidates);usage={...usage,...result.usage};}catch{errorCode="EXTRACTION_FAILED";}
      if(!errorCode)for(const candidate of candidates)await tx.insert(conversationInsights).values({...candidate,normalizedLabel:maskSensitive(candidate.normalizedLabel),activityId:id,activityVersion:a.version,method,fingerprint:hashToken(JSON.stringify(candidate))}).onConflictDoNothing();
      const values={activityId:id,activityVersion:a.version,method,inputHash:hashToken(a.body!),status:errorCode?"failed":"succeeded",candidateCount:candidates.length,errorCode,usage,attempts:(prior?.attempts??0)+1,updatedAt:new Date()};
      const [saved]=prior?await tx.update(extractionRuns).set(values).where(eq(extractionRuns.id,prior.id)).returning():await tx.insert(extractionRuns).values(values).returning();await audit(tx,user,"extraction_run",saved.id,saved.status,o.companyId);return saved;
    });return run.status==="failed"?NextResponse.json({error:{code:"EXTRACTION_FAILED",message:"A análise falhou ou retornou trechos inválidos. Nenhuma sugestão foi aplicada. Você pode registrar manualmente ou repetir a tentativa."},data:run},{status:502}):NextResponse.json({data:run});
  }
  const insightMatch=/^conversation-insights\/([^/]+)\/(edit|review)$/.exec(path);
  if(insightMatch&&write){const id=z.uuid().parse(insightMatch[1]),action=insightMatch[2];const version=z.object({version:z.coerce.number().int().positive()}).parse(body).version;
    const row=await db.transaction(async tx=>{const [initial]=await tx.select().from(conversationInsights).where(eq(conversationInsights.id,id));if(!initial)throw new ResearchError("NOT_FOUND","Insight não encontrado.",404);const {activity:a,opportunity:o}=await lockActivity(tx,initial.activityId);const [insight]=await tx.select().from(conversationInsights).where(eq(conversationInsights.id,id));if(!insight||insight.version!==version||insight.activityVersion!==a.version)throw new ResearchError("CONFLICT","Insight ou conversa mudou. Recarregue.",409);
      if(action==="edit"){if(insight.status==="approved")throw new ResearchError("APPROVED_INSIGHT","Rejeite o insight aprovado antes de corrigi-lo.",409);const input=insightInput.parse(body);if(!containsExcerpt(a.body!,input.rawExcerpt))throw new ResearchError("INVALID_EXCERPT","Trecho ausente na mensagem.",400);const [updated]=await tx.update(conversationInsights).set({...input,normalizedLabel:maskSensitive(input.normalizedLabel),status:"pending",reviewedBy:null,reviewedAt:null,reviewNote:null,version:insight.version+1,updatedAt:new Date()}).where(eq(conversationInsights.id,id)).returning();await audit(tx,user,"conversation_insight",id,"edited_pending_review",o.companyId);return updated;}
      const input=reviewInsightInput.parse(body);if(insight.status===input.status)return insight;
      let publishedEvidenceId=insight.publishedEvidenceId,contradictedEvidenceId=insight.contradictedEvidenceId,contradictedVersion=insight.contradictedVersion;
      if(input.status==="approved"){
        if(!containsExcerpt(a.body!,insight.rawExcerpt))throw new ResearchError("INVALID_EXCERPT","Trecho ausente na conversa atual.",409);
        if(input.contradictsId){if(insight.kind!=="contradiction"||insight.certainty!=="explicit")throw new ResearchError("INVALID_CONTRADICTION","Vincule somente uma negação explícita revisada.",400);const [target]=await tx.select().from(evidence).where(and(eq(evidence.id,input.contradictsId),eq(evidence.companyId,o.companyId)));if(!target||target.type!=="inference"||target.version!==input.contradictsVersion)throw new ResearchError("INVALID_TARGET","Escolha uma hipótese da empresa na versão atual.",409);await tx.update(evidence).set({status:"rejected",reviewedBy:user.id,reviewedAt:new Date(),reviewNote:"Hipótese contradita por declaração revisada do contato.",version:target.version+1,updatedAt:new Date()}).where(eq(evidence.id,target.id));contradictedEvidenceId=target.id;contradictedVersion=target.version+1;}
        if(insight.certainty==="explicit"&&insight.kind!=="opt_out"){
          const [statement]=await tx.insert(evidence).values({companyId:o.companyId,activityId:a.id,type:"customer_statement",claim:insight.normalizedLabel,excerpt:insight.rawExcerpt,observedAt:a.happenedAt,confidenceLabel:"Declaração do contato revisada; não verificada publicamente",status:"approved",reviewedBy:user.id,reviewedAt:new Date(),createdBy:user.id}).returning();publishedEvidenceId=statement.id;
        }
      }else{
        if(publishedEvidenceId){const briefs=await tx.select().from(researchBriefs).where(eq(researchBriefs.companyId,o.companyId));const affected=briefs.filter(b=>b.evidenceSnapshot.some(e=>e.id===publishedEvidenceId)).map(b=>b.id);if(affected.length)await tx.delete(researchBriefs).where(inArray(researchBriefs.id,affected));await tx.delete(evidence).where(eq(evidence.id,publishedEvidenceId));publishedEvidenceId=null;}
        if(contradictedEvidenceId&&contradictedVersion)await tx.update(evidence).set({status:"pending",reviewedBy:null,reviewedAt:null,version:sql`${evidence.version}+1`,reviewNote:"Revisar hipótese: a interpretação da conversa foi rejeitada."}).where(and(eq(evidence.id,contradictedEvidenceId),eq(evidence.version,contradictedVersion)));contradictedEvidenceId=null;contradictedVersion=null;
      }
      const [updated]=await tx.update(conversationInsights).set({status:input.status,reviewedBy:user.id,reviewedAt:new Date(),reviewNote:maskSensitive(input.note),publishedEvidenceId,contradictedEvidenceId,contradictedVersion,version:insight.version+1,updatedAt:new Date()}).where(eq(conversationInsights.id,id)).returning();await invalidateBriefs(tx,o.companyId);await audit(tx,user,"conversation_insight",id,input.status,o.companyId);return updated;
    });return NextResponse.json({data:row});
  }
  return null;
}
