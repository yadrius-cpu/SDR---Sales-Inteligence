import Link from "next/link";
import { and,desc,eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns,companyImports } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { assignees } from "@/lib/crm/service";
import { getImport } from "@/lib/crm/imports";
import { CompanyImport } from "@/components/company-import";
export default async function ImportPage({searchParams}:{searchParams:Promise<{batch?:string}>}){const user=await requireUser();if(user.role==="viewer")return <h1>Acesso restrito</h1>;const {batch}=await searchParams;const [people,campaignRows,recent]=await Promise.all([assignees(),db.select().from(campaigns).orderBy(campaigns.name),db.select({id:companyImports.id,createdAt:companyImports.createdAt}).from(companyImports).where(and(eq(companyImports.createdBy,user.id),eq(companyImports.status,"preview"))).orderBy(desc(companyImports.createdAt)).limit(10)]);let initial;try{if(batch)initial=await getImport(z.uuid().parse(batch),user);}catch{return <><h1>Prévia indisponível</h1><Link href="/companies/import">Nova importação</Link></>;}return <><Link href="/companies">← Empresas</Link><h1>Importar empresas</h1><CompanyImport key={batch??"new"} people={people} campaigns={campaignRows} ownerId={user.id} initial={initial}/>{!batch&&recent.length>0&&<section className="panel"><h2>Prévias recentes</h2>{recent.map(r=><p key={r.id}><Link href={`/companies/import?batch=${r.id}`}>{r.createdAt.toLocaleString("pt-BR",{timeZone:"UTC"})} UTC · retomar →</Link></p>)}</section>}</>;}
