import { associate } from "../crm/service";
import { and,desc,eq,inArray,isNull,ne,or,sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../db";
import { activities,auditEvents,campaigns,companies,contacts,evidence,opportunities,outreachDrafts,products,sources,tasks,users } from "../../db/schema";
import { ResearchError } from "../research/contracts";
import { type Role } from "../security";
import { approveInput,assertReachable,composeDraft,contactInput,draftInput,normalizeName,normalizeProfile,sentInput,versionInput } from "./contracts";
type Actor={id:string;role:Role};type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function companyLock(tx:Tx,id:string){const [row]=await tx.select().from(companies).where(eq(companies.id,id)).for("update");if(!row)throw new ResearchError("NOT_FOUND","Empresa não encontrada.",404);return row;}
function audit(tx:Tx,user:Actor,entityType:string,entityId:string,action:string,metadata:Record<string,unknown>={}){return tx.insert(auditEvents).values({actorId:user.id,entityType,entityId,action,metadata});}
async function activeAssignee(tx:Tx,id:string){const [user]=await tx.select().from(users).where(eq(users.id,id));if(!user?.active||user.role==="viewer")throw new ResearchError("INVALID_ASSIGNEE","Responsável deve ser um operador ou administrador ativo.",400);}
async function opportunityContext(tx:Tx,id:string){
  const [initial]=await tx.select().from(opportunities).where(eq(opportunities.id,id));if(!initial)throw new ResearchError("NOT_FOUND","Oportunidade não encontrada.",404);
  const company=await companyLock(tx,initial.companyId);
  const [opportunity]=await tx.select().from(opportunities).where(eq(opportunities.id,id));return {company,opportunity};
}
async function recipient(tx:Tx,id:string,companyId:string,stage:string){const [contact]=await tx.select().from(contacts).where(and(eq(contacts.id,id),eq(contacts.companyId,companyId)));if(!contact)throw new ResearchError("INVALID_CONTACT","Contato não pertence à empresa desta oportunidade.",400);assertReachable(contact,stage);return contact;}
export async function draftContext(tx:Tx,id:string){const [initial]=await tx.select().from(outreachDrafts).where(eq(outreachDrafts.id,id));if(!initial)throw new ResearchError("NOT_FOUND","Rascunho não encontrado.",404);const context=await opportunityContext(tx,initial.opportunityId);const [draft]=await tx.select().from(outreachDrafts).where(eq(outreachDrafts.id,id));return {...context,draft};}
export async function currentBasis(tx:Tx,draft:typeof outreachDrafts.$inferSelect,companyId:string){
  const [product]=await tx.select().from(products).where(eq(products.id,draft.productId)).for("share");
  if(!product||product.version!==draft.productVersion)throw new ResearchError("STALE_PRODUCT","O catálogo mudou. Gere outro rascunho usando a versão atual.",409);
  for(const snapshot of draft.evidenceSnapshot){const [row]=await tx.select().from(evidence).where(and(eq(evidence.id,snapshot.id),eq(evidence.companyId,companyId)));if(!row||row.version!==snapshot.version||row.status!=="approved"||row.type!=="public_fact"||(row.expiresAt&&row.expiresAt<=new Date()))throw new ResearchError("STALE_EVIDENCE","A evidência mudou ou expirou. Gere outro rascunho após revisão.",409);}
}
function expectedVersion(draft:typeof outreachDrafts.$inferSelect,version:number){if(draft.version!==version)throw new ResearchError("CONFLICT","O rascunho mudou. Recarregue a página.",409);}
function unsent(draft:typeof outreachDrafts.$inferSelect){if(draft.sentConfirmedAt)throw new ResearchError("ALREADY_SENT","O envio já foi confirmado; o histórico não pode ser alterado.",409);}
export async function listCompanySales(companyId:string){const [people,deals]=await Promise.all([db.select().from(contacts).where(eq(contacts.companyId,companyId)).orderBy(contacts.name),db.select().from(opportunities).where(eq(opportunities.companyId,companyId)).orderBy(desc(opportunities.createdAt))]);return {contacts:people,opportunities:deals};}
export async function outreachRoute(path:string,write:boolean,body:unknown,user:Actor,pageRaw:string|null){
  const relevant=/^(companies\/[^/]+\/contacts|contacts\/|opportunities(?:\/|$)|drafts\/|tasks(?:\/|$)|outreach\/|admin\/products\/)/.test(path);
  if(!relevant)return null;if(write&&user.role==="viewer")throw new ResearchError("FORBIDDEN","Seu perfil permite apenas leitura.",403);
  const page=z.coerce.number().int().min(1).max(10000).parse(pageRaw??1);
  const productMatch=/^admin\/products\/([^/]+)\/claims$/.exec(path);
  if(productMatch&&write){
    if(user.role!=="owner")throw new ResearchError("FORBIDDEN","Somente owner altera alegações do produto.",403);
    const id=z.uuid().parse(productMatch[1]);const input=z.object({version:z.coerce.number().int().positive(),approvedClaims:z.string().max(5000),prohibitedClaims:z.string().max(5000),attestation:z.literal("validated")}).parse(body);
    const parseLines=(s:string)=>z.array(z.string().min(3).max(500)).max(10).parse([...new Set(s.split("\n").map(v=>v.trim()).filter(Boolean))]);
    const approvedClaims=parseLines(input.approvedClaims),prohibitedClaims=parseLines(input.prohibitedClaims);
    if(approvedClaims.some(c=>prohibitedClaims.includes(c)))throw new ResearchError("CLAIM_CONFLICT","Uma alegação não pode estar aprovada e proibida ao mesmo tempo.",400);
    const row=await db.transaction(async tx=>{const [old]=await tx.select().from(products).where(eq(products.id,id)).for("update");if(!old)throw new ResearchError("NOT_FOUND","Produto não encontrado.",404);if(old.version!==input.version)throw new ResearchError("CONFLICT","O catálogo mudou; recarregue.",409);const [updated]=await tx.update(products).set({approvedClaims,prohibitedClaims,version:old.version+1,updatedAt:new Date()}).where(eq(products.id,id)).returning();await audit(tx,user,"product",id,"claims_validated",{version:updated.version});return updated;});return NextResponse.json({data:row});
  }
  const peopleMatch=/^companies\/([^/]+)\/contacts$/.exec(path);
  if(peopleMatch){const companyId=z.uuid().parse(peopleMatch[1]);if(!write)return NextResponse.json({data:(await listCompanySales(companyId)).contacts});const input=contactInput.parse(body);
    const profile=normalizeProfile(input.professionalUrl),email=input.workEmail?input.workEmail.toLowerCase():null,nameNormalized=normalizeName(input.name);
    const row=await db.transaction(async tx=>{
      await companyLock(tx,companyId);
      for(const identity of [profile,email].filter((s):s is string=>!!s).sort())await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identity}))`);
      const [duplicate]=await tx.select({id:contacts.id,blocked:contacts.doNotContactAt}).from(contacts).where(or(and(eq(contacts.companyId,companyId),eq(contacts.nameNormalized,nameNormalized)),profile?eq(contacts.professionalUrl,profile):undefined,email?eq(contacts.workEmail,email):undefined)).limit(1);
      if(duplicate)throw new ResearchError("DUPLICATE_CONTACT",duplicate.blocked?"Contato já cadastrado com opt-out. Não recrie para contornar o bloqueio.":"Contato já cadastrado. Revise nome, perfil e e-mail antes de continuar.",409);
      const [created]=await tx.insert(contacts).values({...input,companyId,nameNormalized,professionalUrl:profile,workEmail:email,createdBy:user.id}).returning();await audit(tx,user,"contact",created.id,"created",{companyId});return created;
    });return NextResponse.json({data:row},{status:201});
  }
  const optMatch=/^contacts\/([^/]+)\/opt-out$/.exec(path);
  if(optMatch&&write){const id=z.uuid().parse(optMatch[1]);z.object({confirmation:z.literal("do_not_contact")}).parse(body);
    const row=await db.transaction(async tx=>{const [initial]=await tx.select().from(contacts).where(eq(contacts.id,id));if(!initial)throw new ResearchError("NOT_FOUND","Contato não encontrado.",404);await companyLock(tx,initial.companyId);const [old]=await tx.select().from(contacts).where(eq(contacts.id,id));if(old.doNotContactAt)return old;
      const [updated]=await tx.update(contacts).set({version:sql`${contacts.version}+1`,doNotContactAt:new Date(),contactStatus:"do_not_contact",updatedAt:new Date()}).where(eq(contacts.id,id)).returning();
      const deals=await tx.update(opportunities).set({stage:"do_not_contact",stageVersion:sql`${opportunities.stageVersion}+1`,updatedAt:new Date()}).where(and(eq(opportunities.primaryContactId,id),ne(opportunities.stage,"won"))).returning();const dealIds=deals.map(d=>d.id);
      await tx.update(tasks).set({status:"cancelled",updatedAt:new Date()}).where(and(eq(tasks.status,"pending"),or(eq(tasks.contactId,id),inArray(tasks.opportunityId,dealIds))));
      await tx.update(outreachDrafts).set({status:"rejected",approvedBy:null,approvedAt:null,version:sql`${outreachDrafts.version}+1`,updatedAt:new Date()}).where(and(isNull(outreachDrafts.sentConfirmedAt),or(eq(outreachDrafts.contactId,id),inArray(outreachDrafts.opportunityId,dealIds))));
      for(const deal of deals)await tx.insert(activities).values({opportunityId:deal.id,contactId:id,kind:"opt_out",channel:"manual",authorId:user.id,metadata:{stage:"do_not_contact"}});
      await audit(tx,user,"contact",id,"opt_out",{companyId:old.companyId,cancelledOpportunities:dealIds.length});return updated;
    });return NextResponse.json({data:row});
  }
  if(path==="opportunities"){
    if(!write)return NextResponse.json({data:await db.select().from(opportunities).orderBy(desc(opportunities.createdAt)).limit(50).offset((page-1)*50),pagination:{page,pageSize:50}});
    const input=z.object({companyId:z.uuid(),campaignId:z.uuid(),primaryContactId:z.uuid(),ownerId:z.union([z.literal(""),z.uuid()]).default("")}).parse(body);
    const row=await db.transaction(async tx=>{await companyLock(tx,input.companyId);await recipient(tx,input.primaryContactId,input.companyId,"contact_identified");if(!(await tx.select().from(campaigns).where(eq(campaigns.id,input.campaignId)))[0])throw new ResearchError("INVALID_CAMPAIGN","Campanha não encontrada.",400);await activeAssignee(tx,input.ownerId||user.id);await associate(tx,input.campaignId,input.companyId,user);const [created]=await tx.insert(opportunities).values({...input,ownerId:input.ownerId||user.id}).returning();await audit(tx,user,"opportunity",created.id,"created",{companyId:input.companyId});return created;});return NextResponse.json({data:row},{status:201});
  }
  const opportunityMatch=/^opportunities\/([^/]+)(?:\/(drafts|tasks))?$/.exec(path);
  if(opportunityMatch){const id=z.uuid().parse(opportunityMatch[1]),action=opportunityMatch[2];
    if(!write&&!action){const opportunity=await db.query.opportunities.findFirst({where:eq(opportunities.id,id)});if(!opportunity)throw new ResearchError("NOT_FOUND","Oportunidade não encontrada.",404);return NextResponse.json({data:{opportunity,drafts:await db.select().from(outreachDrafts).where(eq(outreachDrafts.opportunityId,id)).orderBy(desc(outreachDrafts.createdAt)),tasks:await db.select().from(tasks).where(eq(tasks.opportunityId,id)).orderBy(tasks.dueAt)}});}
    if(write&&action==="drafts"){
      const input=draftInput.parse(body);
      const row=await db.transaction(async tx=>{
        const {company,opportunity}=await opportunityContext(tx,id);const contact=await recipient(tx,input.contactId,company.id,opportunity.stage);
        const [campaign]=await tx.select().from(campaigns).where(eq(campaigns.id,opportunity.campaignId));const [product]=await tx.select().from(products).where(eq(products.id,campaign.productId)).for("share");
        let fact: {id:string;version:number;claim:string;sourceUrl:string;observedAt:string}|undefined;
        if(input.evidenceId){const [selected]=await tx.select({e:evidence,url:sources.url}).from(evidence).innerJoin(sources,eq(evidence.sourceId,sources.id)).where(and(eq(evidence.id,input.evidenceId),eq(evidence.companyId,company.id)));if(!selected||selected.e.status!=="approved"||selected.e.type!=="public_fact"||(selected.e.expiresAt&&selected.e.expiresAt<=new Date()))throw new ResearchError("INVALID_EVIDENCE","Escolha um fato público aprovado, vigente e da mesma empresa.",400);fact={id:selected.e.id,version:selected.e.version,claim:selected.e.claim,sourceUrl:selected.url,observedAt:selected.e.observedAt.toISOString()};}
        const generated=composeDraft({name:contact.name,company:company.displayName,persona:input.persona,product,claimIndex:input.claimIndex,fact});
        const [draft]=await tx.insert(outreachDrafts).values({...generated,opportunityId:id,contactId:contact.id,persona:input.persona,productId:product.id,productVersion:product.version,productSnapshot:{name:product.name,approvedClaims:product.approvedClaims,prohibitedClaims:product.prohibitedClaims},evidenceSnapshot:fact?[fact]:[],createdBy:user.id}).returning();
        if(["discovered","researched","qualified","contact_identified"].includes(opportunity.stage)){await tx.update(opportunities).set({stage:"ready_for_review",stageVersion:sql`${opportunities.stageVersion}+1`,updatedAt:new Date()}).where(eq(opportunities.id,id));await tx.insert(activities).values({opportunityId:id,contactId:contact.id,draftId:draft.id,kind:"stage_changed",channel:"internal",authorId:user.id,metadata:{from:opportunity.stage,to:"ready_for_review",reason:"draft_created"}});}
        await audit(tx,user,"outreach_draft",draft.id,"created",{companyId:company.id,productVersion:product.version});return draft;
      });return NextResponse.json({data:row},{status:201});
    }
    if(write&&action==="tasks"){
      const input=z.object({contactId:z.uuid(),assigneeId:z.uuid(),dueAt:z.string().refine(v=>Number.isFinite(Date.parse(v))).transform(v=>new Date(v)),description:z.string().trim().min(5).max(1000)}).parse(body);
      const row=await db.transaction(async tx=>{const {company,opportunity}=await opportunityContext(tx,id);await recipient(tx,input.contactId,company.id,opportunity.stage);await activeAssignee(tx,input.assigneeId);const [created]=await tx.insert(tasks).values({...input,opportunityId:id}).returning();await audit(tx,user,"task",created.id,"created",{companyId:company.id});return created;});return NextResponse.json({data:row},{status:201});
    }
  }
  const draftMatch=/^drafts\/([^/]+)(?:\/(edit|approve|reject|copy-content|copied|confirm-sent))?$/.exec(path);
  if(draftMatch){const id=z.uuid().parse(draftMatch[1]),action=draftMatch[2];
    if(!write&&!action){const draft=await db.query.outreachDrafts.findFirst({where:eq(outreachDrafts.id,id)});if(!draft)throw new ResearchError("NOT_FOUND","Rascunho não encontrado.",404);return NextResponse.json({data:draft});}
    if(write&&action){
      const input=versionInput.parse(body);
      const result=await db.transaction(async tx=>{
        const {company,opportunity,draft}=await draftContext(tx,id);
        if(action==="reject"){expectedVersion(draft,input.version);unsent(draft);const [row]=await tx.update(outreachDrafts).set({status:"rejected",approvedBy:null,approvedAt:null,version:draft.version+1,updatedAt:new Date()}).where(eq(outreachDrafts.id,id)).returning();await audit(tx,user,"outreach_draft",id,"rejected",{companyId:company.id});return row;}
        await recipient(tx,draft.contactId,company.id,opportunity.stage);
        if(action==="confirm-sent"){
          const sent=sentInput.parse(body);
          if(draft.sentConfirmedAt&&draft.sentRequestKey===sent.requestKey)return draft;
        }
        expectedVersion(draft,input.version);unsent(draft);await currentBasis(tx,draft,company.id);
        if(action==="edit"){
          const edit=z.object({message:z.string().trim().min(10).max(6000)}).parse(body);
          const [row]=await tx.update(outreachDrafts).set({message:edit.message,status:"draft",approvedBy:null,approvedAt:null,copiedAt:null,editedBy:user.id,version:draft.version+1,updatedAt:new Date()}).where(eq(outreachDrafts.id,id)).returning();await audit(tx,user,"outreach_draft",id,"edited_requires_review",{companyId:company.id,version:row.version});return row;
        }
        if(action==="approve"){
          approveInput.parse(body);if(draft.status==="rejected")throw new ResearchError("REJECTED","Rascunho descartado. Edite ou gere outro para revisão.",409);
          const [row]=await tx.update(outreachDrafts).set({status:"approved",approvedBy:user.id,approvedAt:new Date(),updatedAt:new Date()}).where(eq(outreachDrafts.id,id)).returning();await audit(tx,user,"outreach_draft",id,"approved",{companyId:company.id,version:draft.version,claimsReviewed:true});return row;
        }
        if(draft.status!=="approved")throw new ResearchError("REQUIRES_APPROVAL","Revise e aprove o rascunho antes de copiar ou confirmar envio.",409);
        if(action==="copy-content")return {message:draft.message,version:draft.version};
        if(action==="copied"){
          const [row]=await tx.update(outreachDrafts).set({copiedAt:new Date(),updatedAt:new Date()}).where(eq(outreachDrafts.id,id)).returning();await audit(tx,user,"outreach_draft",id,"copied_not_sent",{companyId:company.id,version:draft.version});return row;
        }
        const sent=sentInput.parse(body);const now=new Date();
        const [row]=await tx.update(outreachDrafts).set({sentConfirmedAt:now,sentRequestKey:sent.requestKey,updatedAt:now}).where(eq(outreachDrafts.id,id)).returning();
        await tx.update(contacts).set({contactStatus:"contacted",updatedAt:now}).where(eq(contacts.id,draft.contactId));
        const advance=["discovered","researched","qualified","contact_identified","ready_for_review","no_response","follow_up_later"].includes(opportunity.stage);
        if(advance)await tx.update(opportunities).set({stage:"contacted",stageVersion:sql`${opportunities.stageVersion}+1`,updatedAt:now}).where(eq(opportunities.id,opportunity.id));
        await tx.insert(activities).values({opportunityId:opportunity.id,contactId:draft.contactId,draftId:id,kind:"manual_sent_confirmed",channel:"linkedin",authorId:user.id,happenedAt:now,metadata:{version:draft.version,fromStage:opportunity.stage,toStage:advance?"contacted":opportunity.stage,operatorConfirmation:true}});
        if(sent.createFollowUp==="true")await tx.insert(tasks).values({opportunityId:opportunity.id,contactId:draft.contactId,assigneeId:user.id,dueAt:new Date(now.getTime()+sent.followUpDays*86400000),description:"Revisar resposta e decidir manualmente se cabe acompanhamento. Não enviar automaticamente.",sourceDraftId:id});
        await audit(tx,user,"outreach_draft",id,"manual_sent_confirmed",{companyId:company.id,version:draft.version});return row;
      });return NextResponse.json({data:result});
    }
  }
  if(path==="outreach/queue"&&!write)return NextResponse.json({data:await db.select().from(outreachDrafts).where(and(eq(outreachDrafts.status,"draft"),isNull(outreachDrafts.sentConfirmedAt))).orderBy(outreachDrafts.createdAt).limit(50).offset((page-1)*50),pagination:{page,pageSize:50}});
  if(path==="tasks"&&!write)return NextResponse.json({data:await db.select().from(tasks).orderBy(tasks.dueAt).limit(50).offset((page-1)*50),pagination:{page,pageSize:50}});
  const taskMatch=/^tasks\/([^/]+)\/status$/.exec(path);
  if(taskMatch&&write){const id=z.uuid().parse(taskMatch[1]);const input=z.object({status:z.enum(["done","cancelled"])}).parse(body);
    const row=await db.transaction(async tx=>{const [initial]=await tx.select().from(tasks).where(eq(tasks.id,id));if(!initial)throw new ResearchError("NOT_FOUND","Tarefa não encontrada.",404);const {company,opportunity}=await opportunityContext(tx,initial.opportunityId);const [task]=await tx.select().from(tasks).where(eq(tasks.id,id));if(task.status!=="pending")throw new ResearchError("TASK_CLOSED","Tarefa já encerrada.",409);if(input.status==="done")await recipient(tx,task.contactId,company.id,opportunity.stage);const [updated]=await tx.update(tasks).set({status:input.status,updatedAt:new Date()}).where(eq(tasks.id,id)).returning();await audit(tx,user,"task",id,input.status,{companyId:company.id});return updated;});return NextResponse.json({data:row});
  }
  return null;
}
