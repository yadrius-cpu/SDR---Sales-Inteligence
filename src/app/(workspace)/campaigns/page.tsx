import Link from "next/link";
import { db } from "@/db";
import { campaigns,products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/security";
import { assignees } from "@/lib/crm/service";
import { campaignStatusLabels } from "@/lib/crm/contracts";
import { ApiForm } from "@/components/forms";
import { CampaignFields } from "@/components/crm-fields";
export default async function Campaigns(){const user=await requireUser();const [rows,catalog,people]=await Promise.all([db.select().from(campaigns).orderBy(campaigns.name),db.select().from(products),assignees()]);return <><p className="eyebrow">ESTRATÉGIA</p><h1>Campanhas</h1><p>Defina o público e os critérios antes de iniciar as conversas.</p><div className="cards">{rows.map(r=><section className="panel" key={r.id}><span className="badge">{campaignStatusLabels[r.status as keyof typeof campaignStatusLabels]??r.status}</span><h2>{r.name}</h2><p>{r.sector} · {r.geography}</p><strong>{r.employeeMin}–{r.employeeMax} funcionários</strong><p>{people.find(p=>p.id===r.ownerId)?.name}</p><Link href={`/companies?campaignId=${r.id}`}>Empresas vinculadas →</Link><p><Link href={`/pipeline?campaignId=${r.id}`}>Pipeline da campanha →</Link></p>{canWrite(user.role)&&<details><summary>Editar campanha</summary><ApiForm key={r.version} endpoint={`campaigns/${r.id}/edit`} label="Salvar campanha"><input type="hidden" name="version" value={r.version}/><CampaignFields value={r} people={people} catalog={catalog} ownerId={user.id}/></ApiForm></details>}</section>)}</div>{canWrite(user.role)&&<section className="panel"><h2>Nova campanha</h2><ApiForm endpoint="campaigns" label="Criar campanha"><CampaignFields people={people} catalog={catalog} ownerId={user.id}/></ApiForm></section>}</>;}
