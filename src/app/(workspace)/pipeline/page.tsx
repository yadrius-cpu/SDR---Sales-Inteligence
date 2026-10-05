import Link from "next/link";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { assignees,filterInput,listPipeline } from "@/lib/crm/service";
import { stageLabels } from "@/lib/outreach/contracts";
import { CrmFilters,Pagination } from "@/components/crm-filters";
import { StageForm } from "@/components/stage-form";
export default async function Pipeline({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const user=await requireUser(),parsed=filterInput.safeParse(await searchParams);if(!parsed.success)return <><h1>Filtros inválidos</h1><Link href="/pipeline">Limpar filtros</Link></>;
  const [result,people,campaignRows]=await Promise.all([listPipeline(parsed.data),assignees(),db.select().from(campaigns).orderBy(campaigns.name)]);
  return <><p className="eyebrow">ACOMPANHAMENTO COMERCIAL</p><h1>Pipeline</h1><p>Movimente uma oportunidade com motivo e confirmação. Pedidos de não contato devem ser registrados na ficha do contato e bloqueiam todas as oportunidades vinculadas.</p><CrmFilters pipeline filters={result.filters} people={people} campaigns={campaignRows}/><Pagination base="/pipeline" filters={result.filters} total={result.pagination.total}/><p>Até 50 oportunidades por página. A contagem de cada estágio considera todos os resultados dos filtros.</p><div className="pipeline-board">{Object.entries(stageLabels).filter(([stage])=>!result.filters.stage||result.filters.stage===stage).map(([stage,label])=><section className="pipeline-column" key={stage}><h2>{label} <span className="badge">{result.counts.find(s=>s.stage===stage)?.total??0}</span></h2>{result.data.filter(r=>r.opportunity.stage===stage).map(r=><article className="panel" key={r.opportunity.id}><h3><Link href={`/opportunities/${r.opportunity.id}`}>{r.companyName}</Link></h3><p>{r.campaignName}</p><p>Responsável: {r.ownerName}</p>{r.opportunity.lostReason&&<p>Perda: {r.opportunity.lostReason}</p>}{r.opportunity.wonAt&&<p>Ganha em {r.opportunity.wonAt.toLocaleDateString("pt-BR",{timeZone:"UTC"})}</p>}{user.role!=="viewer"&&!["won","do_not_contact"].includes(stage)&&<details><summary>Mover oportunidade</summary><StageForm key={r.opportunity.stageVersion} id={r.opportunity.id} version={r.opportunity.stageVersion} current={stage}/></details>}</article>)}{!result.data.some(r=>r.opportunity.stage===stage)&&<p>Nenhuma oportunidade nesta página.</p>}</section>)}</div></>;
}
