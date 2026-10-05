"use client";
import { useState } from "react";
import { ApiForm } from "./forms";
import { typeLabels } from "@/lib/research/contracts";
type Defaults={type:keyof typeof typeLabels;claim:string;excerpt:string|null;observedAt:string;expiresAt:string|null;sourceUrl:string|null;publisher:string|null;permittedBasis:string|null;sourceType:string|null;version:number};
export function EvidenceForm({companyId,evidenceId,defaults}:{companyId:string;evidenceId?:string;defaults?:Defaults}){
  const [type,setType]=useState(defaults?.type??"public_fact");
  const [sourceKind,setSourceKind]=useState(!defaults||defaults.sourceType==="linkedin_manual"?"linkedin_manual":"manual");
  return <ApiForm endpoint={`companies/${companyId}/evidence${evidenceId?`/${evidenceId}/edit`:""}`} label={evidenceId?"Salvar correção e solicitar nova revisão":"Registrar evidência"}>
    {defaults&&<input type="hidden" name="version" value={defaults.version}/>}
    <div className="fields"><label>Classificação<select name="type" value={type} onChange={e=>setType(e.target.value as typeof type)}>{Object.entries(typeLabels).filter(([value])=>value!=="customer_statement").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Origem<select name="sourceKind" value={sourceKind} onChange={e=>setSourceKind(e.target.value)}><option value="manual">Fonte pública informada manualmente</option><option value="linkedin_manual">LinkedIn — pesquisa manual pelo operador</option></select></label></div>
    {sourceKind==="linkedin_manual"&&<p className="notice">Abra o LinkedIn por conta própria e registre apenas informação profissional necessária que você tenha direito de usar. Este formulário não acessa o LinkedIn nem importa perfis.</p>}
    <label>{type==="unknown"?"O que ainda não sabemos?":type==="inference"?"Hipótese e justificativa (não confirme como fato)":"Informação observada"}<textarea name="claim" required minLength={3} maxLength={2000} rows={3} defaultValue={defaults?.claim}/></label>
    <label>Trecho de apoio (opcional)<textarea name="excerpt" rows={2} maxLength={3000} defaultValue={defaults?.excerpt??""}/></label>
    <div className="fields"><label>Data da observação<input name="observedAt" type="date" required defaultValue={defaults?.observedAt.slice(0,10)??new Date().toISOString().slice(0,10)}/></label><label>Válido até (opcional)<input name="expiresAt" type="date" defaultValue={defaults?.expiresAt?.slice(0,10)??""}/></label></div>
    <p>Fatos públicos exigem fonte, publicador e permissão declarada. Hipóteses e lacunas podem ficar sem fonte; não são fatos confirmados.</p>
    <div className="fields"><label>URL da fonte<input name="sourceUrl" type="url" required={type==="public_fact"} maxLength={2000} defaultValue={defaults?.sourceUrl??""} placeholder={sourceKind==="linkedin_manual"?"https://www.linkedin.com/company/…":"https://…"}/></label><label>Publicador / autor profissional<input name="publisher" required={type==="public_fact"} maxLength={200} defaultValue={defaults?.publisher??""}/></label></div>
    <label>Por que o uso desta informação é permitido?<textarea name="permittedBasis" required={type==="public_fact"} minLength={10} maxLength={1000} rows={2} defaultValue={defaults?.permittedBasis??""} placeholder="Informe autorização, licença ou outro fundamento verificado. Estar visível não basta para presumir permissão."/></label>
  </ApiForm>;
}
