import { and,eq,sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../db";
import { campaigns,companyImports } from "../../db/schema";
import { hashToken } from "../security";
import { ResearchError } from "../research/contracts";
import { companyInput,importInput,mappedRows } from "./contracts";
import { activeOwner,associate,audit,createCompany,duplicates,identityLock,type Actor } from "./service";

export async function getImport(id:string,actor:Actor){
  const batch=await db.query.companyImports.findFirst({where:eq(companyImports.id,id)});if(!batch)throw new ResearchError("NOT_FOUND","Prévia não encontrada.",404);if(batch.createdBy!==actor.id&&actor.role!=="owner")throw new ResearchError("FORBIDDEN","Prévia pertence a outro operador.",403);
  const rows=await db.transaction(async tx=>Promise.all(batch.rows.map(async(row,index)=>({ ...row,matches:row.data?await duplicates(tx,row.data):[],earlierLines:row.data?batch.rows.slice(0,index).filter(r=>r.data&&((row.data!.cnpj&&r.data.cnpj===row.data!.cnpj)||(row.data!.domainNormalized&&r.data.domainNormalized===row.data!.domainNormalized)||r.data.displayName.toLowerCase()===row.data!.displayName.toLowerCase())).map(r=>r.line):[]}))));
  return {...batch,rows};
}
const commitInput=z.object({confirmation:z.literal("reviewed_import"),decisions:z.array(z.object({line:z.number().int().positive(),action:z.enum(["create","link","skip"]),companyId:z.uuid().optional(),distinct:z.boolean().default(false)})).min(1).max(200)});
export async function importRoute(path:string,write:boolean,body:unknown,actor:Actor){
  const match=/^companies\/imports\/([^/]+)(?:\/(commit))?$/.exec(path);if(path!=="companies/import"&&!match)return null;
  if(actor.role==="viewer")throw new ResearchError("FORBIDDEN","Importação exige permissão de escrita.",403);
  if(path==="companies/import"&&write){
    const input=importInput.parse(body);let rows:ReturnType<typeof mappedRows>;
    try{rows=mappedRows(input.csv,input.mapping);}catch(error){throw new ResearchError("INVALID_CSV",error instanceof Error?error.message:"CSV inválido.",400);}
    if(input.campaignId&&!await db.query.campaigns.findFirst({where:eq(campaigns.id,input.campaignId)}))throw new ResearchError("INVALID_CAMPAIGN","Campanha não encontrada.",400);
    const fingerprint=hashToken(JSON.stringify(input));
    const batch=await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${actor.id+input.requestKey}))`);const [prior]=await tx.select().from(companyImports).where(and(eq(companyImports.createdBy,actor.id),eq(companyImports.requestKey,input.requestKey)));if(prior){if(prior.inputHash!==fingerprint)throw new ResearchError("CONFLICT","Chave de prévia usada com outro arquivo.",409);return prior;}await activeOwner(tx,input.ownerId);
      const [created]=await tx.insert(companyImports).values({rows,requestKey:input.requestKey,inputHash:fingerprint,createdBy:actor.id,campaignId:input.campaignId||null,ownerId:input.ownerId,sourceUrl:input.sourceUrl,permittedBasis:input.permittedBasis}).returning();await audit(tx,actor,"company_import",created.id,"preview_created",{rows:rows.length});return created;});
    return NextResponse.json({data:await getImport(batch.id,actor)},{status:201});
  }
  if(!match)return null;const id=z.uuid().parse(match[1]);if(!write&&!match[2])return NextResponse.json({data:await getImport(id,actor)});
  if(write&&match[2]==="commit"){
    const input=commitInput.parse(body),decisionHash=hashToken(JSON.stringify([...input.decisions].sort((a,b)=>a.line-b.line)));
    const result=await db.transaction(async tx=>{await identityLock(tx);const [batch]=await tx.select().from(companyImports).where(eq(companyImports.id,id)).for("update");if(!batch)throw new ResearchError("NOT_FOUND","Prévia não encontrada.",404);if(batch.createdBy!==actor.id&&actor.role!=="owner")throw new ResearchError("FORBIDDEN","Prévia pertence a outro operador.",403);
      if(batch.status==="completed"){if(batch.decisionHash!==decisionHash)throw new ResearchError("CONFLICT","Importação já concluída com outras decisões.",409);return batch.result;}
      if(input.decisions.length!==batch.rows.length||new Set(input.decisions.map(d=>d.line)).size!==batch.rows.length)throw new ResearchError("INVALID_DECISIONS","Revise uma decisão para cada linha.",400);
      await activeOwner(tx,batch.ownerId);const summary={created:0,linked:0,skipped:0,companyIds:[] as string[]};
      for(const row of batch.rows){const decision=input.decisions.find(d=>d.line===row.line);if(!decision)throw new ResearchError("INVALID_DECISIONS","Linha sem decisão.",400);if(decision.action==="skip"){summary.skipped++;continue;}if(!row.data)throw new ResearchError("INVALID_ROW",`Corrija o CSV ou ignore a linha ${row.line}.`,400);
        const matches=await duplicates(tx,row.data);let companyId:string;
        if(decision.action==="link"){
          const existing=matches.find(m=>m.id===decision.companyId);if(!existing)throw new ResearchError("STALE_PREVIEW",`Linha ${row.line}: empresa selecionada não corresponde mais à prévia. Recarregue.`,409);
          if(row.data.cnpj&&existing.cnpj&&existing.cnpj!==row.data.cnpj)throw new ResearchError("IDENTITY_CONFLICT",`Linha ${row.line}: CNPJs diferentes não podem ser vinculados como a mesma empresa.`,409);
          companyId=existing.id;summary.linked++;
        }else{
          if(matches.length&&!decision.distinct)throw new ResearchError("DUPLICATE_REVIEW",`Linha ${row.line}: surgiu uma possível duplicata. Revise a prévia e escolha vincular, ignorar ou confirmar empresa distinta.`,409);
          const normalized=companyInput.parse({...row.data,legalName:row.data.legalName??"",cnpj:row.data.cnpj??"",domain:row.data.domainNormalized??"",city:row.data.city??"",state:row.data.state??"",employeeEstimate:row.data.employeeEstimate??"",ownerId:batch.ownerId,sourceUrl:batch.sourceUrl,permittedBasis:batch.permittedBasis,allowSharedDomain:decision.distinct});
          const created=await createCompany(tx,normalized,actor);companyId=created.id;summary.created++;
        }
        if(batch.campaignId)await associate(tx,batch.campaignId,companyId,actor);summary.companyIds.push(companyId);
      }
      await tx.update(companyImports).set({status:"completed",decisionHash,result:summary,updatedAt:new Date()}).where(eq(companyImports.id,id));await audit(tx,actor,"company_import",id,"committed",{created:summary.created,linked:summary.linked,skipped:summary.skipped});return summary;
    });return NextResponse.json({data:result});
  }return null;
}
