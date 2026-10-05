import { and,asc,count,desc,eq,exists,ilike,inArray,isNull,ne,or,sql,type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../db";
import { activities,auditEvents,campaignCompanies,campaigns,companies,contacts,opportunities,outreachDrafts,products,tasks,users } from "../../db/schema";
import { type Role } from "../security";
import { ResearchError } from "../research/contracts";
import { maskSensitive } from "../conversations/contracts";
import { contactInput,normalizeName,normalizeProfile } from "../outreach/contracts";
import { campaignInput,companyInput,normalizeCompany,type CompanyInput } from "./contracts";
export type Actor={id:string;role:Role};export type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export function audit(tx:Tx,actor:Actor,entityType:string,entityId:string,action:string,metadata:Record<string,unknown>={}){return tx.insert(auditEvents).values({actorId:actor.id,entityType,entityId,action,metadata});}
export async function activeOwner(tx:Tx,id:string){const [u]=await tx.select().from(users).where(eq(users.id,id));if(!u?.active||u.role==="viewer")throw new ResearchError("INVALID_OWNER","Escolha um responsável ativo com permissão de escrita.",400);}
export function identityLock(tx:Tx){return tx.execute(sql`select pg_advisory_xact_lock(hashtext('crm-company-identities'))`);}
export async function companyLock(tx:Tx,id:string){const [row]=await tx.select().from(companies).where(eq(companies.id,id)).for("update");if(!row)throw new ResearchError("NOT_FOUND","Empresa não encontrada.",404);return row;}
export async function associate(tx:Tx,campaignId:string,companyId:string,actor:Actor){
  const [c]=await tx.select().from(campaigns).where(eq(campaigns.id,campaignId));if(!c)throw new ResearchError("INVALID_CAMPAIGN","Campanha não encontrada.",400);
  const [link]=await tx.insert(campaignCompanies).values({campaignId,companyId,addedBy:actor.id}).onConflictDoNothing().returning();
  if(link)await audit(tx,actor,"campaign_company",link.id,"company_associated",{companyId,campaignId});return link;
}
export async function duplicates(tx:Tx,input:ReturnType<typeof normalizeCompany>,exclude?:string){
  const match=or(input.cnpj?eq(companies.cnpj,input.cnpj):undefined,input.domainNormalized?eq(companies.domainNormalized,input.domainNormalized):undefined,sql`lower(${companies.displayName}) = ${input.displayName.toLowerCase()}`);
  return tx.select({id:companies.id,displayName:companies.displayName,cnpj:companies.cnpj,domainNormalized:companies.domainNormalized}).from(companies).where(and(match,exclude?ne(companies.id,exclude):undefined)).orderBy(sql`case when ${companies.cnpj} = ${input.cnpj} then 0 else 1 end`,companies.id).limit(30);
}
export async function createCompany(tx:Tx,input:CompanyInput,actor:Actor){
  const values=normalizeCompany(input),ownerId=input.ownerId||actor.id;await activeOwner(tx,ownerId);
  const matches=await duplicates(tx,values);
  if(values.cnpj&&matches.some(c=>c.cnpj===values.cnpj))throw new ResearchError("DUPLICATE_CNPJ","CNPJ já cadastrado. Use a empresa existente.",409);
  if(values.domainNormalized&&matches.some(c=>c.domainNormalized===values.domainNormalized)&&!input.allowSharedDomain)throw new ResearchError("DUPLICATE_REVIEW","Domínio já cadastrado. Revise se é outra empresa antes de confirmar domínio compartilhado.",409);
  const [row]=await tx.insert(companies).values({...values,ownerId}).returning();await audit(tx,actor,"company",row.id,"created",{companyId:row.id,sharedDomainAcknowledged:input.allowSharedDomain});return row;
}
export async function assignees(){return db.select({id:users.id,name:users.name}).from(users).where(and(eq(users.active,true),ne(users.role,"viewer"))).orderBy(users.name);}
export const filterInput=z.object({q:z.string().trim().max(160).default(""),sector:z.string().trim().max(100).default(""),ownerId:z.union([z.literal(""),z.uuid()]).default(""),campaignId:z.union([z.literal(""),z.uuid()]).default(""),stage:z.union([z.literal(""),z.enum(opportunities.stage.enumValues)]).default(""),state:z.string().trim().max(2).default(""),page:z.coerce.number().int().min(1).max(10000).default(1)}).refine(v=>Object.values(v).every(value=>typeof value!=="string"||!value.includes("\0")),"Caractere nulo não permitido.");
export type Filters=z.infer<typeof filterInput>;
const pattern=(value:string)=>`%${value.replace(/[\\%_]/g,"\\$&")}%`;
export async function listCompanies(raw:unknown){
  const f=filterInput.parse(raw),conditions:SQL[]=[];
  if(f.q)conditions.push(or(ilike(companies.displayName,pattern(f.q)),ilike(companies.legalName,pattern(f.q)),ilike(companies.domainNormalized,pattern(f.q)),ilike(companies.cnpj,pattern(f.q.replace(/[.\/\-]/g,""))))!);
  if(f.sector)conditions.push(ilike(companies.sector,pattern(f.sector)));if(f.ownerId)conditions.push(eq(companies.ownerId,f.ownerId));if(f.state)conditions.push(eq(companies.state,f.state.toUpperCase()));
  if(f.campaignId)conditions.push(exists(db.select({id:campaignCompanies.id}).from(campaignCompanies).where(and(eq(campaignCompanies.companyId,companies.id),eq(campaignCompanies.campaignId,f.campaignId)))));
  const where=and(...conditions);const [rows,totals]=await Promise.all([db.select().from(companies).where(where).orderBy(desc(companies.createdAt),asc(companies.id)).limit(50).offset((f.page-1)*50),db.select({total:count()}).from(companies).where(where)]);
  return {data:rows,pagination:{page:f.page,pageSize:50,total:totals[0].total},filters:f};
}
export async function listPipeline(raw:unknown){
  const f=filterInput.parse(raw),conditions:SQL[]=[];
  if(f.q)conditions.push(ilike(companies.displayName,pattern(f.q)));if(f.ownerId)conditions.push(eq(opportunities.ownerId,f.ownerId));if(f.campaignId)conditions.push(eq(opportunities.campaignId,f.campaignId));if(f.stage)conditions.push(eq(opportunities.stage,f.stage));if(f.sector)conditions.push(ilike(companies.sector,pattern(f.sector)));
  const where=and(...conditions);
  const [data,totals]=await Promise.all([db.select({opportunity:opportunities,companyName:companies.displayName,campaignName:campaigns.name,ownerName:users.name}).from(opportunities).innerJoin(companies,eq(opportunities.companyId,companies.id)).innerJoin(campaigns,eq(opportunities.campaignId,campaigns.id)).innerJoin(users,eq(opportunities.ownerId,users.id)).where(where).orderBy(desc(opportunities.updatedAt),asc(opportunities.id)).limit(50).offset((f.page-1)*50),db.select({stage:opportunities.stage,total:count()}).from(opportunities).innerJoin(companies,eq(opportunities.companyId,companies.id)).where(where).groupBy(opportunities.stage)]);
  return {data,counts:totals,pagination:{page:f.page,pageSize:50,total:totals.reduce((n,s)=>n+s.total,0)},filters:f};
}
async function invalidateDrafts(tx:Tx,condition:SQL){await tx.update(outreachDrafts).set({status:"draft",approvedBy:null,approvedAt:null,copiedAt:null,version:sql`${outreachDrafts.version}+1`,updatedAt:new Date()}).where(and(condition,ne(outreachDrafts.status,"rejected"),isNull(outreachDrafts.sentConfirmedAt)));}
export async function crmRoute(path:string,write:boolean,body:unknown,actor:Actor,params:URLSearchParams){
  const companyMatch=/^companies\/([^/]+)\/(edit|campaigns)$/.exec(path),campaignMatch=/^campaigns\/([^/]+)\/edit$/.exec(path),contactMatch=/^contacts\/([^/]+)\/edit$/.exec(path),ownerMatch=/^opportunities\/([^/]+)\/owner$/.exec(path);
  if(!["companies","campaigns","crm/assignees","pipeline"].includes(path)&&!companyMatch&&!campaignMatch&&!contactMatch&&!ownerMatch)return null;
  if(write&&actor.role==="viewer")throw new ResearchError("FORBIDDEN","Seu perfil permite apenas leitura.",403);
  if(path==="crm/assignees"&&!write)return NextResponse.json({data:await assignees()});
  if(path==="pipeline"&&!write)return NextResponse.json(await listPipeline(Object.fromEntries(params)));
  if(path==="companies"&&!write)return NextResponse.json(await listCompanies(Object.fromEntries(params)));
  if(path==="companies"&&write){const input=companyInput.parse(body);const row=await db.transaction(async tx=>{await identityLock(tx);return createCompany(tx,input,actor);});return NextResponse.json({data:row},{status:201});}
  if(companyMatch&&write){const id=z.uuid().parse(companyMatch[1]);
    if(companyMatch[2]==="campaigns"){const input=z.object({campaignId:z.uuid()}).parse(body);await db.transaction(async tx=>{await companyLock(tx,id);await associate(tx,input.campaignId,id,actor);});return NextResponse.json({data:{ok:true}});}
    const input=companyInput.parse(body),version=z.object({version:z.coerce.number().int().positive()}).parse(body).version;
    const row=await db.transaction(async tx=>{await identityLock(tx);const old=await companyLock(tx,id);if(old.version!==version)throw new ResearchError("CONFLICT","O cadastro mudou. Recarregue.",409);const values=normalizeCompany(input),matches=await duplicates(tx,values,id);await activeOwner(tx,input.ownerId||old.ownerId);
      if(values.cnpj&&matches.some(m=>m.cnpj===values.cnpj))throw new ResearchError("DUPLICATE_CNPJ","CNPJ já cadastrado em outra empresa.",409);
      if(values.domainNormalized&&matches.some(m=>m.domainNormalized===values.domainNormalized)&&!input.allowSharedDomain)throw new ResearchError("DUPLICATE_REVIEW","Revise e confirme o domínio compartilhado.",409);
      const [updated]=await tx.update(companies).set({...values,ownerId:input.ownerId||old.ownerId,version:old.version+1,updatedAt:new Date()}).where(eq(companies.id,id)).returning();
      if(old.displayName!==updated.displayName||old.domainNormalized!==updated.domainNormalized||old.cnpj!==updated.cnpj)await invalidateDrafts(tx,inArray(outreachDrafts.opportunityId,tx.select({id:opportunities.id}).from(opportunities).where(eq(opportunities.companyId,id))));
      await audit(tx,actor,"company",id,"edited",{companyId:id,version:updated.version,fromOwner:old.ownerId,toOwner:updated.ownerId});return updated;
    });return NextResponse.json({data:row});
  }
  if((path==="campaigns"||campaignMatch)&&write){const input=campaignInput.parse(body);const id=campaignMatch?z.uuid().parse(campaignMatch[1]):null;
    const row=await db.transaction(async tx=>{const old=id?(await tx.select().from(campaigns).where(eq(campaigns.id,id)).for("update"))[0]:null;if(id&&!old)throw new ResearchError("NOT_FOUND","Campanha não encontrada.",404);if(old&&old.version!==z.object({version:z.coerce.number().int().positive()}).parse(body).version)throw new ResearchError("CONFLICT","A campanha mudou. Recarregue.",409);
      if(!(await tx.select().from(products).where(eq(products.id,input.productId)))[0])throw new ResearchError("INVALID_PRODUCT","Produto não encontrado.",400);
      if(old&&old.productId!==input.productId)throw new ResearchError("PRODUCT_FIXED","Crie outra campanha para trocar o produto; preserve as oportunidades existentes.",409);
      const ownerId=input.ownerId||old?.ownerId||actor.id;await activeOwner(tx,ownerId);const values={...input,ownerId,targetRoles:input.targetRoles.split(/[,\n]/).map(v=>v.trim()).filter(Boolean)};
      const [updated]=old?await tx.update(campaigns).set({...values,version:old.version+1,updatedAt:new Date()}).where(eq(campaigns.id,old.id)).returning():await tx.insert(campaigns).values(values).returning();await audit(tx,actor,"campaign",updated.id,old?"edited":"created",{version:updated.version,fromOwner:old?.ownerId,toOwner:ownerId});return updated;
    });return NextResponse.json({data:row},{status:id?200:201});
  }
  if(contactMatch&&write){const id=z.uuid().parse(contactMatch[1]),input=contactInput.parse(body),version=z.object({version:z.coerce.number().int().positive()}).parse(body).version;
    const row=await db.transaction(async tx=>{const [initial]=await tx.select().from(contacts).where(eq(contacts.id,id));if(!initial)throw new ResearchError("NOT_FOUND","Contato não encontrado.",404);await companyLock(tx,initial.companyId);const [old]=await tx.select().from(contacts).where(eq(contacts.id,id));if(old.version!==version)throw new ResearchError("CONFLICT","O contato mudou. Recarregue.",409);
      const professionalUrl=normalizeProfile(input.professionalUrl),workEmail=input.workEmail.toLowerCase()||null,nameNormalized=normalizeName(input.name);
      // Keep old identifiers reserved for opt-out; correction of blocked identity requires a dedicated workflow.
      if(old.doNotContactAt&&(old.professionalUrl!==professionalUrl||old.workEmail!==workEmail||old.nameNormalized!==nameNormalized))throw new ResearchError("BLOCKED_IDENTITY","Não altere a identidade de um contato com opt-out.",409);
      for(const identity of [professionalUrl,workEmail].filter((v):v is string=>!!v).sort())await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identity}))`);
      const [duplicate]=await tx.select().from(contacts).where(and(ne(contacts.id,id),or(and(eq(contacts.companyId,old.companyId),eq(contacts.nameNormalized,nameNormalized)),professionalUrl?eq(contacts.professionalUrl,professionalUrl):undefined,workEmail?eq(contacts.workEmail,workEmail):undefined))).limit(1);if(duplicate)throw new ResearchError("DUPLICATE_CONTACT","Nome, perfil ou e-mail já cadastrados. Revise o contato existente.",409);
      const [updated]=await tx.update(contacts).set({...input,nameNormalized,professionalUrl,workEmail,version:old.version+1,updatedAt:new Date()}).where(eq(contacts.id,id)).returning();await invalidateDrafts(tx,eq(outreachDrafts.contactId,id));await audit(tx,actor,"contact",id,"edited_requires_draft_review",{companyId:old.companyId,version:updated.version});return updated;
    });return NextResponse.json({data:row});
  }
  if(ownerMatch&&write){const id=z.uuid().parse(ownerMatch[1]),input=z.object({ownerId:z.uuid(),version:z.coerce.number().int().positive(),reason:z.string().trim().min(5).max(1000)}).parse(body);
    const row=await db.transaction(async tx=>{const [initial]=await tx.select().from(opportunities).where(eq(opportunities.id,id));if(!initial)throw new ResearchError("NOT_FOUND","Oportunidade não encontrada.",404);await companyLock(tx,initial.companyId);const [old]=await tx.select().from(opportunities).where(eq(opportunities.id,id));if(old.stageVersion!==input.version)throw new ResearchError("CONFLICT","A oportunidade mudou. Recarregue.",409);await activeOwner(tx,input.ownerId);const [updated]=await tx.update(opportunities).set({ownerId:input.ownerId,stageVersion:old.stageVersion+1,updatedAt:new Date()}).where(eq(opportunities.id,id)).returning();await tx.insert(activities).values({opportunityId:id,kind:"owner_changed",channel:"internal",authorId:actor.id,metadata:{from:old.ownerId,to:updated.ownerId,reason:maskSensitive(input.reason)}});await audit(tx,actor,"opportunity",id,"owner_changed",{companyId:old.companyId,from:old.ownerId,to:updated.ownerId});return updated;});return NextResponse.json({data:row});
  }
  return null;
}
