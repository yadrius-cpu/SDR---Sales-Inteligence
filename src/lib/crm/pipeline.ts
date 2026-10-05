import { and,eq,isNull,sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../db";
import { activities,contacts,opportunities,outreachDrafts,tasks } from "../../db/schema";
import { ResearchError } from "../research/contracts";
import { maskSensitive } from "../conversations/contracts";
import { audit,companyLock,type Actor } from "./service";

export const stageInput=z.object({stage:z.enum(opportunities.stage.enumValues),version:z.coerce.number().int().positive(),reason:z.string().trim().min(5).max(1000),confirmation:z.literal("reviewed_stage"),contactConfirmation:z.string().optional(),wonConfirmation:z.string().optional(),wonReference:z.string().trim().max(500).default("")});
export async function moveStage(id:string,raw:unknown,actor:Actor){
  if(actor.role==="viewer")throw new ResearchError("FORBIDDEN","Seu perfil permite apenas leitura.",403);const input=stageInput.parse(raw);
  if(input.stage==="do_not_contact")throw new ResearchError("USE_OPT_OUT","Registre o pedido de não contato na ficha do contato; ele bloqueará também as demais oportunidades vinculadas.",409);
  if(input.stage==="contacted"&&input.contactConfirmation!=="contacted_manually")throw new ResearchError("CONTACT_CONFIRMATION","Confirme que o contato ocorreu manualmente.",400);
  if(input.stage==="won"&&(input.wonConfirmation!=="won_manually"||input.wonReference.length<5))throw new ResearchError("WON_CONFIRMATION","Confirme a venda e registre a referência do fechamento.",400);
  return db.transaction(async tx=>{
    const [initial]=await tx.select().from(opportunities).where(eq(opportunities.id,id));if(!initial)throw new ResearchError("NOT_FOUND","Oportunidade não encontrada.",404);await companyLock(tx,initial.companyId);
    const [old]=await tx.select().from(opportunities).where(eq(opportunities.id,id));if(old.stageVersion!==input.version)throw new ResearchError("CONFLICT","A oportunidade mudou. Recarregue.",409);
    const [contact]=await tx.select().from(contacts).where(eq(contacts.id,old.primaryContactId));
    if(old.stage==="do_not_contact"||contact.doNotContactAt||old.stage==="won")throw new ResearchError("STAGE_BLOCKED","Este fluxo não reabre oportunidades ganhas ou contatos com opt-out.",409);
    const reason=maskSensitive(input.reason),now=new Date();const [updated]=await tx.update(opportunities).set({stage:input.stage,stageVersion:old.stageVersion+1,lostReason:input.stage==="lost"?reason:null,wonAt:input.stage==="won"?now:null,wonReference:input.stage==="won"?maskSensitive(input.wonReference):null,updatedAt:now}).where(eq(opportunities.id,id)).returning();
    if(["lost","not_fit","won"].includes(input.stage)){
      await tx.update(tasks).set({status:"cancelled",updatedAt:now}).where(and(eq(tasks.opportunityId,id),eq(tasks.status,"pending")));
      await tx.update(outreachDrafts).set({status:"rejected",approvedBy:null,approvedAt:null,copiedAt:null,version:sql`${outreachDrafts.version}+1`,updatedAt:now}).where(and(eq(outreachDrafts.opportunityId,id),isNull(outreachDrafts.sentConfirmedAt)));
    }
    if(input.stage==="contacted")await tx.update(contacts).set({contactStatus:"contacted",updatedAt:now}).where(eq(contacts.id,contact.id));
    await tx.insert(activities).values({opportunityId:id,contactId:contact.id,kind:"stage_changed",channel:"internal",authorId:actor.id,metadata:{from:old.stage,to:input.stage,reason,manualContactConfirmed:input.stage==="contacted",saleConfirmed:input.stage==="won"}});
    await audit(tx,actor,"opportunity",id,"stage_reviewed",{companyId:old.companyId,from:old.stage,to:updated.stage,version:updated.stageVersion});return updated;
  });
}
export async function pipelineRoute(path:string,write:boolean,body:unknown,actor:Actor){const match=/^opportunities\/([^/]+)\/stage$/.exec(path);if(!match||!write)return null;return NextResponse.json({data:await moveStage(z.uuid().parse(match[1]),body,actor)});}
