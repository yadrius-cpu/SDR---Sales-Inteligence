import { z } from "zod";

const optionalId = z.union([z.literal(""), z.uuid()]).default("");
const date = z.union([z.literal(""), z.iso.date()]).default("");
export const analyticsFilters = z.object({
  campaignId: optionalId, sector: z.string().trim().max(100).default(""), from: date, to: date,
}).refine(v=>!v.sector.includes("\0"),"Caractere nulo não permitido.").refine(v => !v.from || !v.to || v.from <= v.to, "A data inicial deve preceder a final.");
export const metricLabels = { replied: "Resposta recebida", meeting: "Reunião registrada", won: "Venda ganha" };
export const experimentInput = z.object({
  requestKey: z.uuid(), campaignId: z.uuid(), name: z.string().trim().min(3).max(160),
  hypothesis: z.string().trim().min(10).max(1000),
  variantA: z.string().trim().min(5).max(1000), variantB: z.string().trim().min(5).max(1000),
  metric: z.enum(["replied", "meeting", "won"]), windowDays: z.coerce.number().int().min(1).max(90),
  minPerArm: z.coerce.number().int().min(30).max(10000),
  enrollmentEnds: z.iso.date(), confirmation: z.literal("predefined_protocol"),
}).refine(v => v.variantA !== v.variantB, "Defina duas variantes diferentes.");
export type Filters = z.infer<typeof analyticsFilters>;
export const DAY = 86400000;
export function percent(n: number, d: number) { return d ? Math.round(n / d * 1000) / 10 : null; }
export function rateText(n: number, d: number) { return `${n}/${d} · ${d ? `${percent(n, d)}%` : "sem base"}`; }
// Wilson 95% interval for a binomial proportion; descriptive, not a winner test.
export function wilson(n: number, d: number): [number, number] | null {
  if (!d) return null;
  const z = 1.96, p = n / d, denominator = 1 + z * z / d;
  const center = (p + z * z / (2 * d)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / d + z * z / (4 * d * d)) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)].map(v => Math.round(v * 1000) / 10) as [number, number];
}
export type Event = { opportunityId: string; kind: string; happenedAt: Date; createdAt: Date; deletedAt: Date | null; metadata: Record<string, unknown> };
export function eventHits(event: Event, metric: string) {
  if (event.deletedAt) return false;
  if (metric === "replied" && event.kind === "inbound_message") return true;
  if (metric === "contacted" && event.kind === "manual_sent_confirmed") return true;
  return event.kind === "stage_changed" && event.metadata.to === metric;
}
export function armResult(members: { opportunityId: string; createdAt: Date }[], events: Event[], metric: string, windowDays: number, now: Date) {
  const mature = members.filter(m => m.createdAt.getTime() + windowDays * DAY <= now.getTime());
  const successes = mature.filter(m => events.some(e => e.opportunityId === m.opportunityId && e.happenedAt >= m.createdAt && e.createdAt >= m.createdAt && e.happenedAt.getTime() < m.createdAt.getTime() + windowDays * DAY && eventHits(e, metric))).length;
  return { enrolled: members.length, pending: members.length - mature.length, denominator: mature.length, successes, percent: percent(successes, mature.length), interval: wilson(successes, mature.length) };
}
