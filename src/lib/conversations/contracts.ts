import { z } from "zod";
export const insightLabels={pain:"Dor relatada",objection:"Objeção",current_process:"Processo atual",need:"Necessidade",competitor:"Concorrente mencionado",intent:"Intenção",product_request:"Pedido de produto",next_step:"Próximo passo",contradiction:"Contradição / negação",opt_out:"Possível pedido de não contato"};
export const certaintyLabels={explicit:"Declaração explícita",inferred:"Interpretação / inferência"};
export const conversationBody=z.string().trim().min(3).max(8000);
export const happenedAt=z.iso.datetime({offset:true}).transform(v=>new Date(v)).refine(v=>v.getTime()<=Date.now()+60000,"Data futura não permitida.");
export const activityInput=z.object({opportunityId:z.uuid(),contactId:z.uuid(),kind:z.enum(["inbound_message","outbound_note","conversation_note"]),channel:z.enum(["linkedin","email","phone","meeting","other"]),body:conversationBody,happenedAt,permittedBasis:z.string().trim().min(10).max(1000),attestation:z.literal("authorized_and_redacted"),requestKey:z.uuid()});
export const insightInput=z.object({kind:z.enum(Object.keys(insightLabels) as [keyof typeof insightLabels,...(keyof typeof insightLabels)[]]),normalizedLabel:z.string().trim().min(3).max(1000),rawExcerpt:z.string().trim().min(3).max(2000),certainty:z.enum(["explicit","inferred"])});
export const reviewInsightInput=z.object({version:z.coerce.number().int().positive(),status:z.enum(["approved","rejected"]),note:z.string().trim().min(5).max(1000),contradictsId:z.union([z.literal(""),z.uuid()]).default(""),contradictsVersion:z.coerce.number().int().min(0).default(0)});
// Conservative masking is a convenience, not a guarantee. Operators still review before saving.
export function maskSensitive(text:string){return text.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,"[CPF MASCARADO]").replace(/\b(?:\d[ -]?){13,19}\b/g,"[NÚMERO MASCARADO]").replace(/\b(senha|password|token|api[_ -]?key)\s*[:=]\s*(?:\[SEGREDO MASCARADO\]|\S+)/gi,"$1: [SEGREDO MASCARADO]").replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,"[E-MAIL MASCARADO]");}
export function containsExcerpt(body:string,excerpt:string){return excerpt.trim().length>=3&&body.includes(excerpt);}
export type InsightCandidate=z.infer<typeof insightInput>;
