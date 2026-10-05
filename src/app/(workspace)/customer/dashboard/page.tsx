import Link from "next/link";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { customerInsights, customerLeads, customerMemberships, customerOrganizations, customerTasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";

const labels:Record<string,string> = {new:"Novos",qualified:"Qualificados",contacted:"Contatados",meeting:"Reuniões",won:"Ganhos",lost:"Perdidos"};

export default async function CustomerDashboard() {
  const user = await requireUser();
  if (!user.customerOrganizationId) return <><h1>Dashboard</h1><p>Esta conta ainda não está vinculada a uma empresa cliente.</p></>;
  const orgId = user.customerOrganizationId;
  const [organization,leadRows,taskRows,memberCount,insightCount] = await Promise.all([
    db.query.customerOrganizations.findFirst({where:eq(customerOrganizations.id,orgId)}),
    db.select({status:customerLeads.status,total:count()}).from(customerLeads).where(eq(customerLeads.organizationId,orgId)).groupBy(customerLeads.status),
    db.select({total:count()}).from(customerTasks).where(and(eq(customerTasks.organizationId,orgId),eq(customerTasks.status,"pending"),gt(customerTasks.dueAt,new Date(Date.now()-86400000)))),
    db.select({total:count()}).from(customerMemberships).where(and(eq(customerMemberships.organizationId,orgId),eq(customerMemberships.active,true))),
    db.select({total:count()}).from(customerInsights).where(eq(customerInsights.organizationId,orgId)),
  ]);
  const totalLeads = leadRows.reduce((total,row)=>total+Number(row.total),0);
  return <><p className="eyebrow">VISÃO GERAL</p><h1>Olá, {user.name.split(" ")[0]}.</h1><p className="intro">Este é o resumo comercial de {organization?.name ?? "sua empresa"}.</p>
    <div className="stats"><article><span>Leads</span><strong>{totalLeads}</strong><small>Total cadastrado</small></article><article><span>Tarefas pendentes</span><strong>{taskRows[0]?.total ?? 0}</strong><small>Próximas ações</small></article><article><span>Membros</span><strong>{memberCount[0]?.total ?? 0}</strong><small>Equipe ativa</small></article><article><span>Insights</span><strong>{insightCount[0]?.total ?? 0}</strong><small>Hipóteses geradas</small></article></div>
    <section className="panel"><h2>Leads por estágio</h2><div className="cards">{Object.entries(labels).map(([status,label])=><article className="panel" key={status}><span>{label}</span><strong>{leadRows.find(row=>row.status===status)?.total ?? 0}</strong></article>)}</div></section>
    <section className="panel"><h2>Próximas ações</h2><div className="actions"><Link className="button" href="/customer/leads">Abrir leads →</Link><Link href="/customer/tasks">Ver tarefas →</Link><Link href="/customer/leads/import">Importar CSV →</Link></div></section>
  </>;
}
