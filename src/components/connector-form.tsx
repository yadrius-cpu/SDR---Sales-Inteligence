"use client";
import { useState } from "react";
import { ApiForm } from "./forms";
export function ConnectorForm({companyId,initialRequestKey}:{companyId:string;initialRequestKey:string}){
  const [requestKey,setRequestKey]=useState(initialRequestKey);
  return <><p>Informe um identificador Q do Wikidata após conferir que ele corresponde à empresa. O resultado entra como pendente de revisão. Uma consulta por minuto em toda a aplicação.</p><ApiForm key={requestKey} endpoint={`companies/${companyId}/research`} label="Consultar registro público"><input type="hidden" name="requestKey" value={requestKey}/><label>Identificador Wikidata<input name="entityId" required pattern="Q[1-9][0-9]{0,11}" placeholder="Q…"/></label></ApiForm><button className="secondary" type="button" onClick={()=>setRequestKey(crypto.randomUUID())}>Preparar outra consulta</button><p>Repetir a mesma consulta preserva o resultado. Use “Preparar outra consulta” para buscar outro registro ou tentar novamente após falha.</p></>;
}
