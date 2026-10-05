import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ApiForm } from "@/components/forms";
import { db } from "@/db";
import { customerLeads } from "@/db/schema";
import { requireUser } from "@/lib/auth";

const labels:Record<string,string> = {new:"Novo",qualified:"Qualificado",contacted:"Contatado",meeting:"Reunião",won:"Ganho",lost:"Perdido"};
const stages = ["new","qualified","contacted","meeting","won","lost"];

export default async function CustomerLeads() {
  const user = await requireUser();
  if (!user.customerOrganizationId) return <><h1>Leads</h1><p>Esta conta ainda não está vinculada a uma empresa cliente.</p><Link href="/">Voltar</Link></>;
  const rows = await db.select().from(customerLeads).where(eq(customerLeads.organizationId,user.customerOrganizationId)).orderBy(desc(customerLeads.createdAt));
  const canWrite = user.customerRole !== "company_viewer";
  return <><p className="eyebrow">CRM DA EMPRESA</p><h1>Leads e oportunidades</h1><p className="intro">Cadastre empresas potenciais, registre o contato principal e acompanhe a próxima ação. Esses dados pertencem somente à sua empresa.</p><p><Link className="button" href="/customer/leads/import">Importar leads por CSV →</Link></p>
    <section className="panel"><h2>Pipeline</h2><div className="cards">{stages.map(stage=><article className="panel" key={stage}><span className="badge">{labels[stage]}</span><strong>{rows.filter(row=>row.status===stage).length}</strong>{rows.filter(row=>row.status===stage).slice(0,5).map(row=><p key={row.id}><Link href={"/customer/leads/"+row.id+"/edit"}>{row.companyName} →</Link></p>)}</article>)}</div>{!rows.length&&<p>Nenhum lead cadastrado ainda.</p>}</section>
    <section className="panel"><h2>Todos os leads</h2><div className="table-wrap"><table><thead><tr><th>Empresa</th><th>Contato</th><th>Status</th><th>Próxima ação</th><th></th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.companyName}</strong><br/><small>{row.domain || "Domínio não informado"}</small></td><td>{row.contactName || "Não informado"}<br/><small>{row.contactEmail || ""}</small></td><td><span className="badge">{labels[row.status] ?? row.status}</span></td><td>{row.nextAction || "Definir próxima ação"}</td><td><Link href={"/customer/leads/"+row.id+"/edit"}>Editar →</Link></td></tr>)}</tbody></table></div></section>
    {canWrite && <section className="panel"><h2>Novo lead</h2><ApiForm endpoint="customer/leads" label="Cadastrar lead" redirectTo="/customer/leads"><div className="fields"><label>Empresa<input name="companyName" required maxLength={160}/></label><label>Domínio<input name="domain" placeholder="empresa.com.br" maxLength={253}/></label><label>Nome do contato<input name="contactName" maxLength={120}/></label><label>Cargo<input name="contactTitle" maxLength={120}/></label><label>E-mail profissional<input name="contactEmail" type="email" maxLength={254}/></label><label>Status<select name="status" defaultValue="new">{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Próxima ação<input name="nextAction" placeholder="Ex.: pesquisar decisor" maxLength={500}/></label><label>Notas<textarea name="notes" rows={3} maxLength={3000}/></label></div></ApiForm></section>}
  </>;
}
