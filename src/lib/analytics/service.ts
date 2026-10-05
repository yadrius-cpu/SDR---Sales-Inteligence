import { randomInt } from "node:crypto";
import { and, asc, desc, eq, gte, lt, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../db";
import { activities, campaigns, companies, contacts, conversationInsights, experimentMembers, experiments, opportunities } from "../../db/schema";
import { audit, companyLock, type Actor } from "../crm/service";
import { ResearchError } from "../research/contracts";
import { maskSensitive } from "../conversations/contracts";
import { aggregate } from "./aggregate";
import { analyticsFilters, armResult, DAY, experimentInput, type Filters } from "./contracts";

export async function dashboard(filters: Filters) {
  return db.transaction(async tx => {
    const cohort = tx.select({ id: opportunities.id }).from(opportunities).innerJoin(companies,eq(companies.id,opportunities.companyId)).where(and(
      filters.campaignId ? eq(opportunities.campaignId, filters.campaignId) : undefined,
      filters.sector ? eq(companies.sector, filters.sector) : undefined,
      filters.from ? gte(opportunities.createdAt,new Date(`${filters.from}T00:00:00Z`)) : undefined,
      filters.to ? lt(opportunities.createdAt,new Date(new Date(`${filters.to}T00:00:00Z`).getTime()+DAY)) : undefined,
    )).as("cohort");
    const rows = await tx.select({ id: opportunities.id, stage: opportunities.stage, sector: companies.sector, campaignId: campaigns.id, campaignName: campaigns.name, lostReason: opportunities.lostReason })
      .from(opportunities).innerJoin(cohort,eq(cohort.id,opportunities.id)).innerJoin(companies,eq(companies.id,opportunities.companyId)).innerJoin(campaigns,eq(campaigns.id,opportunities.campaignId));
    const events = await tx.select({opportunityId:activities.opportunityId,kind:activities.kind,happenedAt:activities.happenedAt,createdAt:activities.createdAt,deletedAt:activities.deletedAt,metadata:activities.metadata}).from(activities).innerJoin(cohort,eq(cohort.id,activities.opportunityId)).where(lt(activities.happenedAt,new Date()));
    const signals = await tx.select({ opportunityId: activities.opportunityId, kind: conversationInsights.kind, normalizedLabel: conversationInsights.normalizedLabel, certainty: conversationInsights.certainty })
      .from(conversationInsights).innerJoin(activities,eq(activities.id,conversationInsights.activityId)).innerJoin(cohort,eq(cohort.id,activities.opportunityId))
      .where(and(eq(conversationInsights.status,"approved"),eq(conversationInsights.activityVersion,activities.version),isNull(activities.deletedAt),lt(activities.happenedAt,new Date())));
    return { ...aggregate(rows,events,signals), filters, generatedAt: new Date().toISOString() };
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function analyticsOptions() {
  const [campaignRows,sectors] = await Promise.all([
    db.select({id:campaigns.id,name:campaigns.name}).from(campaigns).orderBy(asc(campaigns.name)),
    db.selectDistinct({sector:companies.sector}).from(companies).orderBy(asc(companies.sector)),
  ]);
  return {campaigns:campaignRows,sectors};
}
export async function experimentList() { return db.select().from(experiments).orderBy(desc(experiments.createdAt)); }
export async function enrollmentOptions(campaignId:string) {
  return db.select({id:opportunities.id,companyName:companies.displayName,contactName:contacts.name}).from(opportunities)
    .innerJoin(companies,eq(companies.id,opportunities.companyId)).innerJoin(contacts,eq(contacts.id,opportunities.primaryContactId))
    .where(and(eq(opportunities.campaignId,campaignId),isNull(contacts.doNotContactAt),eq(contacts.contactStatus,"not_contacted"),
      sql`${opportunities.stage} IN ('discovered','researched','qualified','contact_identified','ready_for_review')`,
      sql`NOT EXISTS (SELECT 1 FROM ${experimentMembers} WHERE ${experimentMembers.opportunityId} = ${opportunities.id})`))
    .orderBy(asc(companies.displayName),asc(opportunities.id));
}
export async function experimentDetail(id:string) {
  return db.transaction(async tx => {
    const [experiment] = await tx.select().from(experiments).where(eq(experiments.id,id));
    if(!experiment) throw new ResearchError("NOT_FOUND","Experimento não encontrado.",404);
    const members = await tx.select({id:experimentMembers.id,opportunityId:experimentMembers.opportunityId,arm:experimentMembers.arm,createdAt:experimentMembers.createdAt,companyName:companies.displayName})
      .from(experimentMembers).innerJoin(companies,eq(companies.id,experimentMembers.companyId)).where(eq(experimentMembers.experimentId,id)).orderBy(asc(experimentMembers.createdAt));
    const events = await tx.select({opportunityId:activities.opportunityId,kind:activities.kind,happenedAt:activities.happenedAt,createdAt:activities.createdAt,deletedAt:activities.deletedAt,metadata:activities.metadata})
      .from(activities).innerJoin(experimentMembers,eq(experimentMembers.opportunityId,activities.opportunityId)).where(eq(experimentMembers.experimentId,id));
    const now=new Date();
    const arms=(["A","B"] as const).map(arm=>({arm,...armResult(members.filter(m=>m.arm===arm),events,experiment.metric,experiment.windowDays,now)}));
    const enough=arms.every(a=>a.denominator>=experiment.minPerArm);
    return {experiment,members,arms,assessment:!enough?"Amostra insuficiente. Sem conclusão de vencedor.":"Comparação descritiva com intervalos de 95%. Não estabelece vencedor nem causalidade.",generatedAt:now.toISOString()};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function createExperiment(raw:unknown,actor:Actor) {
  if(actor.role==="viewer") throw new ResearchError("FORBIDDEN","Seu perfil permite apenas leitura.",403);
  const input=experimentInput.parse(raw);
  return db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${actor.id+input.requestKey}))`);
    const [existing]=await tx.select().from(experiments).where(and(eq(experiments.createdBy,actor.id),eq(experiments.requestKey,input.requestKey)));
    const ends=new Date(new Date(`${input.enrollmentEnds}T00:00:00Z`).getTime()+DAY);
    const values={campaignId:input.campaignId,name:maskSensitive(input.name),hypothesis:maskSensitive(input.hypothesis),variantA:maskSensitive(input.variantA),variantB:maskSensitive(input.variantB),metric:input.metric,windowDays:input.windowDays,minPerArm:input.minPerArm,enrollmentEnds:ends};
    if(existing){
      if(Object.entries(values).some(([k,v])=>String(existing[k as keyof typeof existing])!==String(v))) throw new ResearchError("CONFLICT","A chave já foi utilizada com outro protocolo.",409);
      return existing;
    }
    if(ends<=new Date()) throw new ResearchError("INVALID_DATE","O encerramento de inscrições deve ser hoje ou futuro (UTC).",400);
    const [campaign]=await tx.select().from(campaigns).where(eq(campaigns.id,input.campaignId));
    if(!campaign) throw new ResearchError("INVALID_CAMPAIGN","Campanha não encontrada.",400);
    const [created]=await tx.insert(experiments).values({...values,requestKey:input.requestKey,createdBy:actor.id}).returning();
    await audit(tx,actor,"experiment",created.id,"protocol_registered",{version:1});return created;
  });
}
export async function enroll(id:string,raw:unknown,actor:Actor) {
  if(actor.role==="viewer") throw new ResearchError("FORBIDDEN","Seu perfil permite apenas leitura.",403);
  const input=z.object({opportunityId:z.uuid(),confirmation:z.literal("eligible_before_contact")}).parse(raw);
  return db.transaction(async tx=>{
    const [experiment]=await tx.select().from(experiments).where(eq(experiments.id,id)).for("update");
    if(!experiment) throw new ResearchError("NOT_FOUND","Experimento não encontrado.",404);
    const [initial]=await tx.select().from(opportunities).where(eq(opportunities.id,input.opportunityId));
    if(!initial) throw new ResearchError("NOT_FOUND","Oportunidade não encontrada.",404);
    await companyLock(tx,initial.companyId);
    const [old]=await tx.select().from(experimentMembers).where(eq(experimentMembers.opportunityId,initial.id));
    if(old){if(old.experimentId===id)return old;throw new ResearchError("ALREADY_ENROLLED","Oportunidade já participa de outro experimento.",409);}
    const [companyMember]=await tx.select().from(experimentMembers).where(and(eq(experimentMembers.experimentId,id),eq(experimentMembers.companyId,initial.companyId)));
    if(companyMember) throw new ResearchError("ALREADY_ENROLLED","Esta empresa já participa deste experimento.",409);
    const [opportunity]=await tx.select().from(opportunities).where(eq(opportunities.id,initial.id));
    const [contact]=await tx.select().from(contacts).where(eq(contacts.id,opportunity.primaryContactId));
    const history=await tx.select({id:activities.id}).from(activities).where(and(eq(activities.opportunityId,opportunity.id),sql`(${activities.kind} IN ('manual_sent_confirmed','inbound_message','outbound_note') OR (${activities.kind} = 'stage_changed' AND ${activities.metadata}->>'to' IN ('contacted','replied','discovery','meeting','trial','negotiation','won','lost','no_response','not_fit','do_not_contact')))`));
    if(experiment.enrollmentEnds<=new Date()||opportunity.campaignId!==experiment.campaignId||contact.doNotContactAt||contact.contactStatus!=="not_contacted"||history.length||!["discovered","researched","qualified","contact_identified","ready_for_review"].includes(opportunity.stage))
      throw new ResearchError("INELIGIBLE","Inscrição encerrada ou oportunidade inelegível: use a campanha definida, antes do primeiro contato e sem opt-out.",409);
    const [member]=await tx.insert(experimentMembers).values({experimentId:id,opportunityId:opportunity.id,companyId:opportunity.companyId,arm:randomInt(2)?"B":"A",createdBy:actor.id}).returning();
    await audit(tx,actor,"experiment_member",member.id,"randomized",{experimentId:id,arm:member.arm});return member;
  });
}
export async function analyticsRoute(path:string,write:boolean,body:unknown,actor:Actor,params:URLSearchParams) {
  if(path==="analytics"&&!write)return NextResponse.json({data:await dashboard(analyticsFilters.parse(Object.fromEntries(params)))});
  if(path==="experiments")return NextResponse.json({data:write?await createExperiment(body,actor):await experimentList()},{status:write?201:200});
  const match=/^experiments\/([^/]+)(\/enroll)?$/.exec(path);
  if(!match)return null;
  const id=z.uuid().parse(match[1]);
  if(write&&match[2])return NextResponse.json({data:await enroll(id,body,actor)});
  if(!write&&!match[2])return NextResponse.json({data:await experimentDetail(id)});
  return null;
}
