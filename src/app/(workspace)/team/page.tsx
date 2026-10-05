import Link from "next/link";
import { eq } from "drizzle-orm";
import { TeamInviteForm } from "@/components/team-invite-form";
import { db } from "@/db";
import { customerMemberships, customerOrganizations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";

const roleLabels:Record<string,string> = {company_admin:"Administrador",sales_manager:"Gestor comercial",sales_user:"Vendedor",company_viewer:"Somente leitura"};

export default async function Team() {
  const user = await requireUser();
  const membership = await db.query.customerMemberships.findFirst({where:eq(customerMemberships.userId,user.id)});
  if (!membership) return <><h1>Equipe da empresa</h1><p>Esta conta ainda não está vinculada a uma empresa cliente.</p><Link href="/">Voltar ao início</Link></>;
  const [organization,members] = await Promise.all([
    db.query.customerOrganizations.findFirst({where:eq(customerOrganizations.id,membership.organizationId)}),
    db.select({id:users.id,name:users.name,email:users.email,role:customerMemberships.role,active:customerMemberships.active}).from(customerMemberships).innerJoin(users,eq(customerMemberships.userId,users.id)).where(eq(customerMemberships.organizationId,membership.organizationId)),
  ]);
  const canInvite = membership.role === "company_admin";
  return <><p className="eyebrow">ADMINISTRAÇÃO DA EMPRESA</p><h1>Equipe de {organization?.name ?? "sua empresa"}</h1><p className="intro">Convide funcionários para trabalhar no Sales Intelligence. Cada pessoa acessa somente os dados desta empresa.</p>
    <section className="panel"><h2>Membros</h2><div className="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Status</th></tr></thead><tbody>{members.map(member=><tr key={member.id}><td>{member.name}</td><td>{member.email}</td><td>{roleLabels[member.role]}</td><td>{member.active ? "Ativo" : "Bloqueado"}</td></tr>)}</tbody></table></div></section>
    {canInvite ? <section className="panel"><h2>Convidar funcionário</h2><p>O link expira em sete dias e pode ser enviado manualmente ao funcionário.</p><TeamInviteForm/></section> : <section className="notice"><strong>Permissão de convite</strong><p>Somente o administrador da empresa pode convidar novos funcionários.</p></section>}
  </>;
}
