"use client";
import { useState } from "react";
import { ApiForm } from "./forms";
export function InsightReview({id,version,canContradict,targets}:{id:string;version:number;canContradict:boolean;targets:{id:string;version:number;claim:string}[]}){
  const [selected,setSelected]=useState("");
  return <ApiForm endpoint={`conversation-insights/${id}/review`} label="Registrar revisão do insight"><input type="hidden" name="version" value={version}/><div className="fields"><label>Decisão<select name="status"><option value="approved">Aprovar interpretação</option><option value="rejected">Rejeitar interpretação</option></select></label><label>Justificativa<input name="note" minLength={5} maxLength={1000} required/></label></div>{canContradict&&<><label>Hipótese negada por este trecho (opcional)<select name="contradictsId" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Não vincular a hipótese</option>{targets.map(t=><option key={t.id} value={t.id}>{t.claim}</option>)}</select></label><input type="hidden" name="contradictsVersion" value={targets.find(t=>t.id===selected)?.version??0}/><p>Aprovar a relação rejeita a hipótese selecionada e registra a declaração revisada na ficha.</p></>}</ApiForm>;
}
