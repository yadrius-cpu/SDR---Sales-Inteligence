import Link from "next/link";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/security";
import { assignees,filterInput,listCompanies } from "@/lib/crm/service";
import { ApiForm } from "@/components/forms";
import { CompanyFields } from "@/components/crm-fields";
import { CrmFilters,Pagination } from "@/components/crm-filters";
export default async function Companies({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const user=await requireUser(),parsed=filterInput.safeParse(await searchParams);if(!parsed.success)return <><h1>Filtros inválidos</h1><Link href="/companies">Limpar filtros</Link></>;
  const [result,people,campaignRows]=await Promise.all([listCompanies(parsed.data),assignees(),db.select().from(campaigns).orderBy(campaigns.name)]);const {data:rows,filters,pagination}=result;
  return <><p className="eyebrow">PROSPECÇÃO</p><h1>Empresas</h1><p>Pesquise cadastros e revise possíveis duplicatas antes de incluir outra empresa.</p>{canWrite(user.role)&&<Link className="button" href="/companies/import">Importar empresas por CSV →</Link>}<CrmFilters filters={filters} people={people} campaigns={campaignRows}/><section className="panel"><h2>Cadastros</h2><Pagination base="/companies" filters={filters} total={pagination.total}/><div className="table-wrap"><table><thead><tr><th>Empresa</th><th>CNPJ</th><th>Domínio</th><th>Setor / local</th><th>Responsável</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><Link href={`/companies/${r.id}`}>{r.displayName} →</Link></td><td>{r.cnpj??"Não informado"}</td><td>{r.domainNormalized??"Não informado"}</td><td>{r.sector}<br/>{[r.city,r.state].filter(Boolean).join(" / ")}</td><td>{people.find(p=>p.id===r.ownerId)?.name??"Responsável inativo"}</td></tr>)}</tbody></table>{!rows.length&&<p>Nenhuma empresa encontrada.</p>}</div></section>{canWrite(user.role)&&<section className="panel"><h2>Adicionar empresa</h2><ApiForm endpoint="companies" label="Salvar empresa"><CompanyFields people={people} ownerId={user.id}/></ApiForm></section>}</>;
}
