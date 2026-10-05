import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaignCompanies,campaigns,companies } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/security";
import { assignees } from "@/lib/crm/service";
import { CompanyFields } from "@/components/crm-fields";
import { ApiForm } from "@/components/forms";
export default async function ManageCompany({params}:{params:Promise<{id:string}>}){
  const user=await requireUser(),{id}=await params;if(!z.uuid().safeParse(id).success)notFound();const company=await db.query.companies.findFirst({where:eq(companies.id,id)});if(!company)notFound();
  const [people,all,links]=await Promise.all([assignees(),db.select().from(campaigns).orderBy(campaigns.name),db.select().from(campaignCompanies).where(eq(campaignCompanies.companyId,id))]);
  return <><Link href={`/companies/${id}`}>← Ficha da empresa</Link><h1>Cadastro de {company.displayName}</h1><p>Alterações de nome, CNPJ ou domínio exigem nova revisão dos rascunhos ainda não enviados.</p>{canWrite(user.role)?<section className="panel"><ApiForm key={company.version} endpoint={`companies/${id}/edit`} label="Salvar cadastro"><input type="hidden" name="version" value={company.version}/><CompanyFields value={company} people={people} ownerId={user.id}/></ApiForm></section>:<p>Seu perfil permite somente consulta.</p>}<section className="panel"><h2>Campanhas vinculadas</h2>{links.map(l=><p key={l.id}><Link href={`/companies?campaignId=${l.campaignId}`}>{all.find(c=>c.id===l.campaignId)?.name}</Link></p>)}{!links.length&&<p>Nenhuma campanha vinculada.</p>}{canWrite(user.role)&&all.length>0&&<ApiForm endpoint={`companies/${id}/campaigns`} label="Vincular campanha"><label>Campanha<select name="campaignId">{all.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><p>O vínculo não cria oportunidade nem exige um contato.</p></ApiForm>}</section></>;
}
