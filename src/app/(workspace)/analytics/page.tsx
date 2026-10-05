import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { analyticsOptions, dashboard } from "@/lib/analytics/service";
import { analyticsFilters, rateText } from "@/lib/analytics/contracts";
import { stageLabels } from "@/lib/outreach/contracts";
import { insightLabels } from "@/lib/conversations/contracts";

export default async function Analytics({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireUser();
  const parsed=analyticsFilters.safeParse(await searchParams);
  if(!parsed.success)return <section className="panel"><h1>Filtros inválidos</h1><p>Confira as datas, a campanha e o segmento.</p><Link href="/analytics">Limpar filtros</Link></section>;
  const filters=parsed.data;
  const [data,options]=await Promise.all([dashboard(filters),analyticsOptions()]);
  return <>
    <p className="eyebrow">ETAPA 5 · ANÁLISE COMERCIAL</p><h1>Insights e experimentos</h1>
    <p>Analise oportunidades e os relatos revisados dos contatos.</p><Link className="button" href="/experiments">Abrir experimentos A/B →</Link>
    <section className="panel"><h2>Selecionar a base</h2><form method="get"><div className="fields">
      <label>Campanha<select name="campaignId" defaultValue={filters.campaignId}><option value="">Todas</option>{options.campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Segmento (setor atual)<select name="sector" defaultValue={filters.sector}><option value="">Todos</option>{options.sectors.map(s=><option key={s.sector}>{s.sector}</option>)}</select></label>
      <label>Criadas a partir de (UTC)<input type="date" name="from" defaultValue={filters.from}/></label><label>Criadas até (UTC, inclusive)<input type="date" name="to" defaultValue={filters.to}/></label>
    </div><button>Aplicar filtros</button> <Link href="/analytics">Limpar</Link></form>
    <p>Unidade: oportunidade. O período filtra a data de criação; os resultados incluem o histórico registrado até agora. Uma empresa pode ter mais de uma oportunidade. O setor e o estágio refletem o cadastro atual.</p></section>
    <div className="stats"><article><span>Oportunidades na base</span><strong>{data.total}</strong></article><article><span>Com resposta registrada</span><strong>{data.respondents}</strong><small>{rateText(data.respondents,data.total)}</small></article><article><span>Ganhas atualmente</span><strong>{data.stages.find(s=>s.stage==="won")?.count??0}</strong><small>{rateText(data.stages.find(s=>s.stage==="won")?.count??0,data.total)}</small></article></div>
    {!data.total&&<p className="notice">Nenhuma oportunidade encontrada para estes filtros. Ajuste a base para começar a análise.</p>}
    <section className="panel"><h2>Funil: marcos registrados</h2><p>Cada oportunidade conta uma vez por marco, mesmo com várias mensagens. Etapas puladas não são presumidas; os números podem não formar uma sequência decrescente.</p>
      {data.milestones.map(m=><div className="analytics-bar" key={m.metric}><div><strong>{stageLabels[m.metric]}</strong><span>{rateText(m.count,m.denominator)}</span></div><meter min={0} max={Math.max(1,m.denominator)} value={m.count} aria-label={stageLabels[m.metric]}/></div>)}
    </section>
    <section className="panel"><h2>Distribuição atual por estágio</h2><p>Os totais abaixo somam {data.total} oportunidades. Não são taxas de passagem entre etapas.</p><div className="table-wrap analytics-table"><table><thead><tr><th>Estágio</th><th>Oportunidades / base</th></tr></thead><tbody>{data.stages.map(s=><tr key={s.stage}><td>{stageLabels[s.stage]}</td><td>{rateText(s.count,data.total)}</td></tr>)}</tbody></table></div></section>
    <section className="panel"><h2>Resultados por campanha</h2><div className="table-wrap analytics-table"><table><thead><tr><th>Campanha</th><th>Base</th><th>Ganhas</th><th>Perdidas</th></tr></thead><tbody>{data.campaigns.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.count}</td><td>{rateText(c.won,c.count)}</td><td>{rateText(c.lost,c.count)}</td></tr>)}</tbody></table></div></section>
    <section className="panel"><h2>Dores, objeções e pedidos de produto</h2><p>Somente insights aprovados da versão vigente da conversa. Rótulos iguais são agrupados por setor e tipo de certeza; cada oportunidade conta uma vez por tema. Uma oportunidade pode aparecer em vários temas. A ausência de um relato não indica ausência de dor.</p>
      {!data.themes.length?<p>Nenhum insight revisado nesta base.</p>:<div className="table-wrap analytics-table"><table><thead><tr><th>Segmento / tema</th><th>Natureza</th><th>Entre respondentes</th><th>Na base do segmento</th></tr></thead><tbody>{data.themes.map((t,i)=><tr key={i}><td><strong>{t.sector}</strong><br/>{insightLabels[t.kind as keyof typeof insightLabels]}: {t.label}</td><td>{t.certainty==="explicit"?"Declaração explícita":"Interpretação"}</td><td>{rateText(t.respondentHits,t.respondentCount)}{t.respondentCount<30&&<small className="sample-note">Amostra pequena</small>}</td><td>{rateText(t.count,t.denominator)}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="panel"><h2>Motivos de perda</h2><p>Considera oportunidades atualmente perdidas. Motivos livres equivalentes podem aparecer separados; revise na oportunidade para corrigir.</p>{!data.losses.length?<p>Nenhuma perda nesta base.</p>:<ul>{data.losses.map(l=><li key={l.reason}>{l.reason} — {rateText(l.count,l.denominator)}</li>)}</ul>}</section>
    <p>Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR",{timeZone:"UTC"})} UTC.</p>
  </>;
}
