import { z } from "zod";
import { containsExcerpt,insightInput,type InsightCandidate } from "./contracts";
export interface ConversationExtractor { readonly method:string; extract(text:string):Promise<unknown>; }
const rules:{kind:InsightCandidate["kind"];pattern:RegExp}[]=[
  {kind:"opt_out",pattern:/não (?:me )?(?:contat|contact|envie|mande)|pare de (?:enviar|mandar)|remov[ae].*(?:lista|contato)/i},
  {kind:"contradiction",pattern:/não (?:temos|usamos|sofremos|enfrentamos|precisamos)|isso não (?:ocorre|acontece|é verdade)/i},
  {kind:"pain",pattern:/(?:dificuldade|problema|prejuízo|perdemos tempo|recebemos.*(?:golpe|phishing))/i},
  {kind:"objection",pattern:/(?:sem orçamento|muito caro|não temos orçamento|não é prioridade|não tenho interesse)/i},
  {kind:"current_process",pattern:/(?:usamos|utilizamos|nosso processo|hoje .*encaminhamos)/i},
  {kind:"need",pattern:/(?:precisamos|necessitamos)/i},
  {kind:"competitor",pattern:/(?:concorrente|fornecedor atual|contratamos)/i},
  {kind:"intent",pattern:/(?:queremos avaliar|tenho interesse|gostaria de conhecer)/i},
  {kind:"product_request",pattern:/(?:seria útil|gostaria que|precisa ter|funcionalidade)/i},
  {kind:"next_step",pattern:/(?:agendar|marcar.*reunião|fale comigo|retorne|envie.*proposta)/i},
];
export const localExtractor:ConversationExtractor={method:"local_keyword_candidates_v1",async extract(text){const sentences=text.split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(s=>s.length>=3&&s.length<=2000);const results:InsightCandidate[]=[];for(const sentence of sentences){for(const rule of rules){if(rule.pattern.test(sentence)){results.push({kind:rule.kind,normalizedLabel:sentence.slice(0,1000),rawExcerpt:sentence,certainty:"inferred"});if(results.length>=12)return results;}}}return results;}};
export function validateCandidates(text:string,result:unknown){const candidates=z.array(insightInput).max(12).parse(result);if(candidates.some(c=>!containsExcerpt(text,c.rawExcerpt)))throw new Error("UNSUPPORTED_EXCERPT");return candidates;}
// No provider credentials, tool calls, browser actions or remote requests are used here.
// Future LLM adapters must return only this validated data contract, never executable actions.
