import { insightLabels } from "./contracts";
type Insight={id:string;kind:string;normalizedLabel:string;status:string;activityVersion:number;currentActivityVersion:number;deleted:boolean;contactId:string|null;publishedEvidenceId:string|null};
export function suggestNextAction(stage:string,contactId:string,blocked:boolean,insights:Insight[]){
  const base={requires_approval:true,uncertainties:["Sugestão por regras locais, sem análise de IA."],evidence_ids:[] as string[],insight_ids:[] as string[]};
  if(blocked||["do_not_contact","lost","won","not_fit"].includes(stage))return {...base,action:"Não recomendar novo contato",reason:"Contato bloqueado ou oportunidade encerrada."};
  const usable=insights.filter(i=>!i.deleted&&i.activityVersion===i.currentActivityVersion&&i.contactId===contactId&&i.status!=="rejected");
  const optout=usable.find(i=>i.kind==="opt_out");if(optout)return {...base,action:"Suspender abordagem e verificar pedido de não contato",reason:"Há indicação de opt-out na conversa; o operador deve conferir e registrar o bloqueio explícito.",insight_ids:[optout.id]};
  if(usable.some(i=>i.status==="pending"))return {...base,action:"Revisar interpretações pendentes",reason:"O conteúdo da conversa ainda não foi validado pelo operador."};
  const ordered=["contradiction","next_step","objection","pain","need","intent","current_process","product_request","competitor"];
  const chosen=ordered.map(kind=>usable.find(i=>i.kind===kind&&i.status==="approved")).find(Boolean);
  if(!chosen)return {...base,action:"Registrar contexto ou fazer uma pergunta aberta",reason:"Não há insight revisado que sustente uma abordagem específica.",uncertainties:[...base.uncertainties,"Hipótese genérica de discovery; não é dor confirmada."]};
  return {...base,action:chosen.kind==="contradiction"?"Revisar a hipótese à luz da resposta":chosen.kind==="next_step"?"Conferir o próximo passo declarado antes de criar uma tarefa":chosen.kind==="objection"?"Esclarecer a objeção sem insistência":"Preparar uma pergunta de discovery sobre o trecho revisado",reason:`${insightLabels[chosen.kind as keyof typeof insightLabels]??"Insight revisado"}: ${chosen.normalizedLabel}`,insight_ids:[chosen.id],evidence_ids:chosen.publishedEvidenceId?[chosen.publishedEvidenceId]:[]};
}
