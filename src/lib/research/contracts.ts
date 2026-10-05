import { z } from "zod";
export const typeLabels = {public_fact:"Observado publicamente",inference:"Hipótese / inferência",unknown:"Desconhecido",customer_statement:"Declarado pelo contato"};
export const statusLabels = {pending:"Aguardando revisão",approved:"Aprovado",rejected:"Rejeitado"};
export const publicUrl = z.string().trim().max(2000).url().refine(value=>{
  const u = new URL(value);
  return ["https:","http:"].includes(u.protocol) && !u.username && !u.password;
},"Use URL HTTP(S), sem credenciais.");
const dateInput = z.string().min(1).refine(v=>Number.isFinite(Date.parse(v)),"Data inválida").transform(v=>new Date(v));
export const evidenceInput = z.object({
  sourceKind:z.enum(["manual","linkedin_manual"]).default("manual"),
  type:z.enum(["public_fact","inference","unknown"]), claim:z.string().trim().min(3).max(2000),
  excerpt:z.string().trim().max(3000).default(""), observedAt:dateInput,
  expiresAt:z.union([z.literal(""),dateInput]).optional().transform(v=>v||null),
  sourceUrl:z.union([z.literal(""),publicUrl]).default(""), publisher:z.string().trim().max(200).default(""),
  permittedBasis:z.string().trim().max(1000).default(""),
}).superRefine((v,ctx)=>{
  if(v.sourceKind==="linkedin_manual"&&v.sourceUrl&&URL.canParse(v.sourceUrl)){const host=new URL(v.sourceUrl).hostname;if(host!=="linkedin.com"&&!host.endsWith(".linkedin.com"))ctx.addIssue({code:"custom",message:"A fonte LinkedIn exige link do domínio linkedin.com.",path:["sourceUrl"]});}
  if(v.observedAt instanceof Date && v.observedAt.getTime()>Date.now()+60000)ctx.addIssue({code:"custom",message:"Data de observação no futuro.",path:["observedAt"]});
  if(v.expiresAt instanceof Date && v.observedAt instanceof Date && v.expiresAt<=v.observedAt)ctx.addIssue({code:"custom",message:"Validade deve ser posterior à observação.",path:["expiresAt"]});
  if((v.type==="public_fact" || v.sourceUrl) && (!v.sourceUrl||!v.publisher||v.permittedBasis.length<10))ctx.addIssue({code:"custom",message:"Informe URL, publicador e fundamento da permissão (mínimo 10 caracteres).",path:["sourceUrl"]});
});
export const reviewInput=z.object({version:z.coerce.number().int().positive(),status:z.enum(["approved","rejected"]),note:z.string().trim().min(5).max(1000)});
export const briefInput=z.object({summary:z.string().trim().min(5).max(6000),unknowns:z.string().max(4000).transform(v=>v.split("\n").map(s=>s.trim()).filter(Boolean)),discoveryQuestion:z.string().trim().min(5).max(1000)});
export class ResearchError extends Error { constructor(public code:string,message:string,public status=400){super(message);} }
export function confidence(type:keyof typeof typeLabels){return type==="public_fact"?"Fonte pública; sujeito à revisão":type==="inference"?"Hipótese, não confirmada":"Não informado";}
export type BriefEvidence={id:string;version:number;type:keyof typeof typeLabels;claim:string;observedAt:Date;expiresAt:Date|null;status:string;sourceUrl:string|null};
export function composeBrief(rows:BriefEvidence[],now=new Date()){
  const eligible=rows.filter(r=>r.status==="approved"&&(!r.expiresAt||r.expiresAt>now));
  const facts=eligible.filter(r=>r.type==="public_fact");
  const hypotheses=eligible.filter(r=>r.type==="inference");
  const statements=eligible.filter(r=>r.type==="customer_statement");
  const unknowns=eligible.filter(r=>r.type==="unknown").map(r=>r.claim);
  if(!facts.length)unknowns.unshift("Nenhum fato público vigente foi aprovado para esta empresa.");
  return {
    summary:["Compilação das evidências revisadas; não é pesquisa automática nem conclusão de IA.","Fatos públicos:",...facts.map(r=>`• ${r.claim}`),...(facts.length?[]:["Nenhum fato revisado disponível."]),"Declarações do contato (não verificadas publicamente):",...statements.map(r=>`• ${r.claim}`),"Hipóteses (não confirmadas):",...hypotheses.map(r=>`• ${r.claim}`),...(hypotheses.length?[]:["Nenhuma hipótese registrada."])].join("\n"),
    unknowns,discoveryQuestion:"Como a empresa lida hoje com mensagens suspeitas e quem participa desse processo? (Pergunta genérica; não pressupõe uma dor.)",
    evidenceSnapshot:eligible.map(r=>({id:r.id,version:r.version,type:r.type,claim:r.claim,sourceUrl:r.sourceUrl,observedAt:r.observedAt.toISOString()})),
  };
}
