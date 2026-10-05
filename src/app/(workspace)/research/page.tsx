import Link from "next/link";
import { and,eq,asc,count,sql } from "drizzle-orm";
import { db } from "@/db";
import { companies,evidence,researchBriefs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { typeLabels } from "@/lib/research/contracts";
export default async function ReviewQueue({searchParams}:{searchParams:Promise<{page?:string}>}){
  await requireUser();const query=await searchParams;const page=Math.max(1,Math.min(10000,Number(query.page)||1));const offset=(Math.floor(page)-1)*50;
  const [rows,briefs,[total]]=await Promise.all([
    db.select({id:evidence.id,companyId:companies.id,company:companies.displayName,claim:evidence.claim,type:evidence.type}).from(evidence).innerJoin(companies,eq(companies.id,evidence.companyId)).where(eq(evidence.status,"pending")).orderBy(asc(evidence.createdAt),evidence.id).limit(50).offset(offset),
    db.select({id:researchBriefs.id,companyId:companies.id,company:companies.displayName,version:researchBriefs.version}).from(researchBriefs).innerJoin(companies,eq(companies.id,researchBriefs.companyId)).where(and(eq(researchBriefs.status,"pending"),sql`not exists (select 1 from research_briefs newer where newer.company_id = ${researchBriefs.companyId} and newer.version > ${researchBriefs.version})`)).orderBy(asc(researchBriefs.createdAt)).limit(50),
    db.select({value:count()}).from(evidence).where(eq(evidence.status,"pending")),
  ]);
  return <><p className="eyebrow">REVISÃO HUMANA</p><h1>Pesquisa para revisar</h1><p>Confira identidade da empresa, fonte, data e classificação antes de aprovar. Aprovar uma hipótese não a transforma em fato.</p><section className="panel"><h2>Evidências pendentes ({total.value})</h2>{rows.map(r=><article className="evidence-card" key={r.id}><span className="badge">{typeLabels[r.type]}</span><h3><Link href={`/companies/${r.companyId}`}>{r.company} →</Link></h3><p>{r.claim}</p></article>)}{!rows.length&&<p>Nenhuma evidência pendente nesta página.</p>}<div className="actions">{page>1&&<Link href={`/research?page=${page-1}`}>← Anterior</Link>}<span>Página {Math.floor(page)}</span>{offset+rows.length<total.value&&<Link href={`/research?page=${page+1}`}>Próxima →</Link>}</div></section><section className="panel"><h2>Resumos aguardando revisão</h2><p>Até 50 empresas com resumo pendente. Apenas a versão mais recente de cada empresa aparece nesta fila.</p>{briefs.map(b=><p key={b.id}><Link href={`/companies/${b.companyId}#brief`}>{b.company} · versão {b.version} →</Link></p>)}{!briefs.length&&<p>Nenhum resumo pendente.</p>}</section></>;
}
