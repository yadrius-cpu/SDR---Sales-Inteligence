import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiForm } from "@/components/forms";
import { enrollmentOptions, experimentDetail } from "@/lib/analytics/service";
import { metricLabels, rateText } from "@/lib/analytics/contracts";
import { ResearchError } from "@/lib/research/contracts";

export default async function Experiment({params}:{params:Promise<{id:string}>}) {
  const user=await requireUser();const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
  const data=await experimentDetail(id).catch(e=>{if(e instanceof ResearchError&&e.status===404)notFound();throw e;});const e=data.experiment;
  const options=user.role!=="viewer"?await enrollmentOptions(e.campaignId):[];
  return <><Link href="/experiments">← Experimentos</Link><p className="eyebrow">PROTOCOLO FIXO · V{e.protocolVersion}</p><h1>{e.name}</h1><p>{e.hypothesis}</p>
    <section className="panel"><h2>Regras da comparação</h2><p>Métrica: {metricLabels[e.metric as keyof typeof metricLabels]}. Janela: {e.windowDays} dias após cada inscrição. Unidade de sorteio: uma oportunidade por empresa neste experimento, com probabilidade igual para A e B. Elegíveis: oportunidades da campanha definida, antes do primeiro contato, sem opt-out e sem participação anterior em outro experimento.</p><p>Inscrições até {new Date(e.enrollmentEnds.getTime()-1).toISOString().slice(0,10)} (UTC). Mínimo definido: {e.minPerArm} por grupo com janela completa.</p>
    <div className="fields"><div><h3>Abordagem A</h3><p>{e.variantA}</p></div><div><h3>Abordagem B</h3><p>{e.variantB}</p></div></div></section>
    <section className="panel"><h2>Resultados observados</h2><p>Entram no denominador apenas participantes com a janela completa, incluindo quem não respondeu. O sucesso exige evento registrado dentro da janela; o estágio atual sozinho não comprova o resultado. Registros corrigidos ou apagados podem atualizar as contagens.</p>
      <div className="table-wrap analytics-table"><table><thead><tr><th>Grupo</th><th>Inscritos</th><th>Aguardando janela</th><th>Sucessos / janela completa</th><th>Intervalo de 95%</th></tr></thead><tbody>{data.arms.map(a=><tr key={a.arm}><td>{a.arm}</td><td>{a.enrolled}</td><td>{a.pending}</td><td>{rateText(a.successes,a.denominator)}</td><td>{a.interval?`${a.interval[0]}% a ${a.interval[1]}%`:"Sem base"}</td></tr>)}</tbody></table></div><p className="notice">{data.assessment}</p><p>Os intervalos de Wilson descrevem a incerteza de cada proporção. O mínimo de 30 por grupo não garante poder estatístico. A seleção manual de participantes e a execução das variantes exigem revisão do operador.</p>
    </section>
    {user.role!=="viewer"&&e.enrollmentEnds>new Date()&&<section className="panel"><h2>Incluir oportunidade e sortear grupo</h2><p>Escolha uma oportunidade da campanha. O histórico será conferido ao salvar e o sorteio é permanente. Depois, aplique manualmente a abordagem do grupo exibido abaixo.</p><ApiForm endpoint={`experiments/${id}/enroll`} label="Inscrever e sortear"><label>Oportunidade<select name="opportunityId" required><option value="">Selecione</option>{options.map(o=><option key={o.id} value={o.id}>{o.companyName} · {o.contactName}</option>)}</select></label><label className="checkbox"><input type="checkbox" name="confirmation" value="eligible_before_contact" required/>Esta oportunidade ainda não foi contatada e atende às regras do experimento.</label></ApiForm></section>}
    <section className="panel"><h2>Participantes e abordagem atribuída</h2>{!data.members.length?<p>Nenhuma oportunidade inscrita.</p>:<div className="table-wrap analytics-table"><table><thead><tr><th>Empresa / oportunidade</th><th>Grupo</th><th>Inscrição (UTC)</th></tr></thead><tbody>{data.members.map(m=><tr key={m.id}><td><Link href={`/opportunities/${m.opportunityId}`}>{m.companyName} →</Link></td><td>{m.arm}</td><td>{m.createdAt.toLocaleString("pt-BR",{timeZone:"UTC"})}</td></tr>)}</tbody></table></div>}</section>
  </>;
}
