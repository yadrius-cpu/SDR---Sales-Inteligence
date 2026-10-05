import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { ApiForm } from "@/components/forms";
import { analyticsOptions, experimentList } from "@/lib/analytics/service";
import { metricLabels } from "@/lib/analytics/contracts";

export default async function Experiments() {
  const user=await requireUser();const [options,experiments]=await Promise.all([analyticsOptions(),experimentList()]);
  return <><Link href="/analytics">← Insights</Link><p className="eyebrow">EXPERIMENTOS A/B</p><h1>Testar uma hipótese</h1>
    <p>Defina o protocolo antes de incluir oportunidades. O sorteio escolhe A ou B com a mesma probabilidade; a abordagem continua manual.</p>
    {experiments.map(e=><section className="panel" key={e.id}><h2><Link href={`/experiments/${e.id}`}>{e.name} →</Link></h2><p>{e.hypothesis}</p><span className="badge">Protocolo v{e.protocolVersion}</span><p>{metricLabels[e.metric as keyof typeof metricLabels]} em {e.windowDays} dias · mínimo de {e.minPerArm} por grupo.</p></section>)}
    {!experiments.length&&<p className="notice">Nenhum experimento registrado.</p>}
    {user.role!=="viewer"&&<section className="panel"><h2>Registrar protocolo</h2><p>O protocolo fica fixo após salvar. Para testar outra hipótese ou alterar as regras, crie outro experimento. Só entram oportunidades da campanha escolhida, sem contato prévio ou opt-out, com uma oportunidade por empresa neste experimento. A mesma oportunidade não participa de outro experimento.</p>
      <ApiForm endpoint="experiments" label="Salvar protocolo"><input type="hidden" name="requestKey" value={randomUUID()}/>
        <label>Nome<input name="name" required minLength={3} maxLength={160}/></label><label>Campanha<select name="campaignId" required><option value="">Selecione</option>{options.campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Hipótese<textarea name="hypothesis" required minLength={10} maxLength={1000} placeholder="Qual mudança você espera observar e por quê?"/></label>
        <div className="fields"><label>Abordagem A<textarea name="variantA" required minLength={5} maxLength={1000}/></label><label>Abordagem B<textarea name="variantB" required minLength={5} maxLength={1000}/></label></div>
        <div className="fields"><label>Métrica primária<select name="metric">{Object.entries(metricLabels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><label>Janela após inscrição (dias)<input name="windowDays" type="number" min={1} max={90} defaultValue={14} required/></label>
        <label>Mínimo de oportunidades por grupo<input name="minPerArm" type="number" min={30} max={10000} defaultValue={30} required/></label><label>Último dia para inscrições (UTC)<input name="enrollmentEnds" type="date" min={new Date().toISOString().slice(0,10)} required/></label></div>
        <label className="checkbox"><input type="checkbox" name="confirmation" value="predefined_protocol" required/>Defini as variantes e a métrica antes de conhecer os resultados.</label>
      </ApiForm></section>}
  </>;
}
