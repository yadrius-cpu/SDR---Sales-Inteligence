import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../db";
import { activities, auditEvents, companies, evidence, researchBriefs, researchRuns, sources, sourceSettings } from "../../db/schema";
import { hashToken, type Role } from "../security";
import { briefInput, composeBrief, confidence, evidenceInput, ResearchError, reviewInput } from "./contracts";
import { downloadEntity, entityIdSchema, parseEntity } from "./wikidata";
type Actor={id:string;role:Role};
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockCompany(tx:Tx,id:string){
  const [company]=await tx.select().from(companies).where(eq(companies.id,id)).for("update");
  if(!company)throw new ResearchError("NOT_FOUND","Empresa não encontrada.",404);
  return company;
}
function audit(tx:Tx,user:Actor,entityType:string,entityId:string,action:string,metadata:Record<string,unknown>={}){
  return tx.insert(auditEvents).values({actorId:user.id,entityType,entityId,action,metadata});
}
async function invalidateBriefs(tx:Tx,companyId:string){
  await tx.update(researchBriefs).set({status:"pending",reviewedBy:null,reviewedAt:null}).where(and(eq(researchBriefs.companyId,companyId),eq(researchBriefs.status,"approved")));
}
export async function getEvidence(companyId:string,connection:Tx|typeof db=db){
  return connection.select({id:evidence.id,companyId:evidence.companyId,type:evidence.type,claim:evidence.claim,excerpt:evidence.excerpt,observedAt:evidence.observedAt,expiresAt:evidence.expiresAt,confidenceLabel:evidence.confidenceLabel,status:evidence.status,version:evidence.version,reviewedAt:evidence.reviewedAt,reviewNote:evidence.reviewNote,sourceUrl:sql<string|null>`coalesce(${sources.url}, case when ${evidence.activityId} is not null then '/opportunities/' || ${activities.opportunityId}::text || '/conversation#activity-' || ${evidence.activityId}::text end)`,sourceType:sources.sourceType,activityId:evidence.activityId,publisher:sources.publisher,permittedBasis:sql<string|null>`coalesce(${sources.permittedBasis}, ${activities.permittedBasis})`,collectedAt:sources.collectedAt}).from(evidence).leftJoin(sources,eq(evidence.sourceId,sources.id)).leftJoin(activities,eq(evidence.activityId,activities.id)).where(eq(evidence.companyId,companyId)).orderBy(desc(evidence.createdAt),evidence.id);
}
export async function getBriefs(companyId:string){return db.select().from(researchBriefs).where(eq(researchBriefs.companyId,companyId)).orderBy(desc(researchBriefs.version)).limit(20);}
export function snapshotMatches(snapshot:{id:string;version:number}[],current:{id:string;version:number}[]){
  return snapshot.length===current.length&&snapshot.every(s=>current.some(c=>c.id===s.id&&c.version===s.version));
}
export async function researchRoute(path:string,write:boolean,body:unknown,user:Actor,pageRaw:string|null,download:typeof downloadEntity=downloadEntity){
  if(path==="admin/research-source"){
    if(user.role!=="owner")throw new ResearchError("FORBIDDEN","Somente owner configura fontes.",403);
    if(!write)return NextResponse.json({data:(await db.query.sourceSettings.findFirst({where:eq(sourceSettings.id,"wikidata")}))??{id:"wikidata",enabled:false,contactEmail:null}});
    const input=z.object({enabled:z.enum(["true","false"]).transform(v=>v==="true"),contactEmail:z.union([z.literal(""),z.email()])}).refine(v=>!v.enabled||!!v.contactEmail,{message:"Informe o contato do operador para habilitar a fonte."}).parse(body);
    await db.transaction(async tx=>{await tx.insert(sourceSettings).values({id:"wikidata",...input}).onConflictDoUpdate({target:sourceSettings.id,set:{...input,updatedAt:new Date()}});await audit(tx,user,"source_policy",user.id,input.enabled?"wikidata_enabled":"wikidata_disabled");});
    return NextResponse.json({data:{ok:true}});
  }
  if(path==="research/review-queue"&&!write){
    const page=z.coerce.number().int().min(1).max(10000).parse(pageRaw??1);
    const rows=await db.select({id:evidence.id,companyId:evidence.companyId,companyName:companies.displayName,claim:evidence.claim,type:evidence.type,version:evidence.version}).from(evidence).innerJoin(companies,eq(companies.id,evidence.companyId)).where(eq(evidence.status,"pending")).orderBy(evidence.createdAt,evidence.id).limit(50).offset((page-1)*50);
    return NextResponse.json({data:rows,pagination:{page,pageSize:50}});
  }
  const match=/^companies\/([^/]+)(?:\/(evidence|research|briefs)(?:\/([^/]+)(?:\/(edit|review))?)?)?$/.exec(path);
  if(!match)return null;
  const companyId=z.uuid().parse(match[1]);const resource=match[2],id=match[3],action=match[4];
  if(id)z.uuid().parse(id);
  if(write && user.role==="viewer")throw new ResearchError("FORBIDDEN","Seu perfil permite apenas leitura.",403);
  const company=await db.query.companies.findFirst({where:eq(companies.id,companyId)});
  if(!company)throw new ResearchError("NOT_FOUND","Empresa não encontrada.",404);
  if(!write&&!resource)return NextResponse.json({data:{company,evidence:await getEvidence(companyId),briefs:await getBriefs(companyId)}});
  if(!write&&resource==="evidence"&&!id)return NextResponse.json({data:await getEvidence(companyId)});
  if(!write&&resource==="briefs"&&!id)return NextResponse.json({data:await getBriefs(companyId)});
  if(write&&resource==="evidence"&&(!id||action==="edit")){
    const input=evidenceInput.parse(body);
    const version=id?z.object({version:z.coerce.number().int().positive()}).parse(body).version:null;
    const row=await db.transaction(async tx=>{
      await lockCompany(tx,companyId);
      if(id){const [old]=await tx.select().from(evidence).where(and(eq(evidence.id,id),eq(evidence.companyId,companyId)));if(!old)throw new ResearchError("NOT_FOUND","Evidência não encontrada.",404);if(old.activityId)throw new ResearchError("CONVERSATION_EVIDENCE","Revise esta declaração na conversa de origem.",409);if(old.version!==version)throw new ResearchError("CONFLICT","A evidência mudou. Recarregue antes de editar.",409);}
      let sourceId:string|null=null;
      if(input.sourceUrl){const [source]=await tx.insert(sources).values({companyId,sourceType:input.sourceKind,url:input.sourceUrl,publisher:input.publisher,permittedBasis:input.permittedBasis,contentHash:hashToken(input.excerpt||input.claim),createdBy:user.id}).returning();sourceId=source.id;}
      const values={type:input.type,claim:input.claim,excerpt:input.excerpt||null,observedAt:input.observedAt,expiresAt:input.expiresAt,sourceId,confidenceLabel:confidence(input.type),status:"pending" as const,reviewedAt:null,reviewedBy:null,reviewNote:null,updatedAt:new Date()};
      const [result]=id?await tx.update(evidence).set({...values,version:version!+1}).where(eq(evidence.id,id)).returning():await tx.insert(evidence).values({...values,companyId,createdBy:user.id}).returning();
      await invalidateBriefs(tx,companyId);await audit(tx,user,"evidence",result.id,id?"corrected":"created",{companyId,version:result.version,type:result.type});return result;
    });
    return NextResponse.json({data:row},{status:id?200:201});
  }
  if(write&&resource==="evidence"&&id&&action==="review"){
    const input=reviewInput.parse(body);
    const row=await db.transaction(async tx=>{
      await lockCompany(tx,companyId);
      const [old]=await tx.select().from(evidence).where(and(eq(evidence.id,id),eq(evidence.companyId,companyId)));
      if(!old)throw new ResearchError("NOT_FOUND","Evidência não encontrada.",404);
      if(old.activityId)throw new ResearchError("CONVERSATION_EVIDENCE","Revise esta declaração na conversa de origem.",409);if(old.version!==input.version)throw new ResearchError("CONFLICT","A evidência mudou. Recarregue antes de revisar.",409);
      if(input.status==="approved"&&old.expiresAt&&old.expiresAt<=new Date())throw new ResearchError("EXPIRED","Corrija a evidência expirada antes de aprovar.",409);
      const [result]=await tx.update(evidence).set({status:input.status,reviewNote:input.note,reviewedAt:new Date(),reviewedBy:user.id,version:old.version+1,updatedAt:new Date()}).where(eq(evidence.id,id)).returning();
      await invalidateBriefs(tx,companyId);await audit(tx,user,"evidence",id,input.status,{companyId,version:result.version});return result;
    });return NextResponse.json({data:row});
  }
  if(write&&resource==="briefs"&&(!id||action==="edit")){
    const edits=id?briefInput.parse(body):null;
    const result=await db.transaction(async tx=>{
      await lockCompany(tx,companyId);
      const [latest]=await tx.select().from(researchBriefs).where(eq(researchBriefs.companyId,companyId)).orderBy(desc(researchBriefs.version)).limit(1);
      if(id&&latest?.id!==id)throw new ResearchError("CONFLICT","Edite somente a versão mais recente do resumo.",409);
      const composed=composeBrief(await getEvidence(companyId,tx));
      const values=edits?{...edits,evidenceSnapshot:latest.evidenceSnapshot}:composed;
      const [row]=await tx.insert(researchBriefs).values({...values,companyId,version:(latest?.version??0)+1,method:edits?"operator_edit_v1":"evidence_compilation_v1",createdBy:user.id}).returning();
      await audit(tx,user,"research_brief",row.id,edits?"edited":"compiled",{companyId,version:row.version});return row;
    });return NextResponse.json({data:result},{status:201});
  }
  if(write&&resource==="briefs"&&id&&action==="review"){
    const input=reviewInput.parse(body);
    const result=await db.transaction(async tx=>{
      await lockCompany(tx,companyId);
      const [latest]=await tx.select().from(researchBriefs).where(eq(researchBriefs.companyId,companyId)).orderBy(desc(researchBriefs.version)).limit(1);
      if(latest?.id!==id||latest.version!==input.version)throw new ResearchError("CONFLICT","Revise somente o resumo mais recente.",409);
      if(input.status==="approved"&&!snapshotMatches(latest.evidenceSnapshot,composeBrief(await getEvidence(companyId,tx)).evidenceSnapshot))throw new ResearchError("STALE_BRIEF","As evidências mudaram ou expiraram. Compile um novo resumo.",409);
      const [row]=await tx.update(researchBriefs).set({status:input.status,reviewedBy:user.id,reviewedAt:new Date(),updatedAt:new Date()}).where(eq(researchBriefs.id,id)).returning();
      await audit(tx,user,"research_brief",id,input.status,{companyId,version:row.version});return row;
    });return NextResponse.json({data:result});
  }
  if(write&&resource==="research"&&!id){
    const input=z.object({entityId:entityIdSchema,requestKey:z.uuid()}).parse(body);
    const result=await db.transaction(async tx=>{
      await lockCompany(tx,companyId);
      const [existing]=await tx.select().from(researchRuns).where(and(eq(researchRuns.companyId,companyId),eq(researchRuns.requestKey,input.requestKey)));
      if(existing){if(existing.entityId!==input.entityId)throw new ResearchError("CONFLICT","Chave de requisição já usada para outro registro.",409);return existing;}
      const [settings]=await tx.select().from(sourceSettings).where(eq(sourceSettings.id,"wikidata")).for("update");
      if(!settings?.enabled||!settings.contactEmail)throw new ResearchError("SOURCE_DISABLED","Wikidata desabilitado. Use o cadastro manual ou solicite configuração ao administrador.",409);
      if(settings.lastFetchedAt&&Date.now()-settings.lastFetchedAt.getTime()<60000)throw new ResearchError("RATE_LIMITED","Aguarde um minuto entre consultas à fonte.",429);
      await tx.update(sourceSettings).set({lastFetchedAt:new Date()}).where(eq(sourceSettings.id,"wikidata"));
      let imported:ReturnType<typeof parseEntity>|undefined,contentHash="",errorCode:string|null=null;
      try{const raw=await download(input.entityId,settings.contactEmail);imported=parseEntity(raw,input.entityId);contentHash=hashToken(raw);}catch(error){errorCode=error instanceof ResearchError?error.code:"INVALID_SOURCE";}
      if(imported){
        const [source]=await tx.insert(sources).values({companyId,sourceType:"wikidata",url:imported.url,publisher:"Wikidata",permittedBasis:"CC0 — https://www.wikidata.org/wiki/Wikidata:Data_access",contentHash,createdBy:user.id}).returning();
        const [row]=await tx.insert(evidence).values({companyId,sourceId:source.id,type:"public_fact",claim:imported.claim,excerpt:imported.excerpt,observedAt:new Date(),confidenceLabel:"Registro público; confirmar identidade da empresa",createdBy:user.id}).returning();
        await audit(tx,user,"evidence",row.id,"imported_pending_review",{companyId,entityId:input.entityId});await invalidateBriefs(tx,companyId);
      }
      const [run]=await tx.insert(researchRuns).values({companyId,...input,status:imported?"succeeded":"failed",errorCode,createdBy:user.id}).returning();
      await audit(tx,user,"research_run",run.id,run.status,{companyId,errorCode});return run;
    });
    return result.status==="failed"?NextResponse.json({error:{code:result.errorCode,message:"A consulta falhou. Nenhuma evidência foi criada. Use o cadastro manual ou tente novamente mais tarde."},data:result},{status:502}):NextResponse.json({data:result});
  }
  return null;
}
