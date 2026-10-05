import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerInsights, customerMemberships, customerOrganizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";

const labels:Record<string,string> = {icp:"ICP",persona:"Persona",priorities:"Prioridades"};

export default async function Insights() {
  const user = await requireUser();
  const membership = await db.query.customerMemberships.findFirst({where:eq(customerMemberships.userId,user.id)});
  if (!membership) return <><h1>Insights da empresa</h1><p>Esta conta ainda não está vinculada a uma empresa cliente.</p><Link href="/">Voltar ao início</Link></>;
  const [organization,rows] = await Promise.all([
    db.query.customerOrganizations.findFirst({where:eq(customerOrganizations.id,membership.organizationId)}),
    db.select().from(customerInsights).where(eq(customerInsights.organizationId,membership.organizationId)).orderBy(customerInsights.kind),
  ]);
  return <><p className="eyebrow">SALES INTELLIGENCE</p><h1>Insights comerciais</h1><p className="intro">Primeiras hipóteses geradas a partir do diagnóstico de {organization?.name ?? "sua empresa"}. Valide cada uma com a equipe antes de usar em uma abordagem.</p>
    {!rows.length ? <section className="panel"><h2>Diagnóstico ainda não concluído</h2><p>Complete as quatro etapas para gerar o ICP, a persona e as prioridades comerciais.</p><Link className="button" href="/onboarding">Continuar diagnóstico →</Link></section> :
      <div className="cards">{rows.map(row=><section className="panel" key={row.id}><span className="badge">{labels[row.kind] ?? row.kind} · hipótese</span><h2>{row.title}</h2><p>{row.summary}</p><dl>{Object.entries(row.details).map(([key,value])=><div key={key}><dt>{key.replaceAll("_"," ")}</dt><dd>{value}</dd></div>)}</dl></section>)}</div>}
  </>;
}
