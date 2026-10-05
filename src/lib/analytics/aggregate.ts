import { eventHits, percent, type Event } from "./contracts";

export type CohortRow = { id: string; stage: string; sector: string; campaignId: string; campaignName: string; lostReason: string | null };
export type Signal = { opportunityId: string; kind: string; normalizedLabel: string; certainty: string };
export function aggregate(rows: CohortRow[], events: Event[], signals: Signal[]) {
  const ids = new Set(rows.map(r => r.id));
  const liveEvents = events.filter(e => ids.has(e.opportunityId) && !e.deletedAt);
  const respondents = new Set(liveEvents.filter(e => eventHits(e, "replied")).map(e => e.opportunityId));
  const stages = [...new Set(rows.map(r => r.stage))].sort().map(stage => ({ stage, count: rows.filter(r => r.stage === stage).length }));
  const milestones = ["contacted", "replied", "meeting", "won"].map(metric => {
    const count = new Set(liveEvents.filter(e => eventHits(e, metric)).map(e => e.opportunityId)).size;
    return { metric, count, denominator: rows.length, percent: percent(count, rows.length) };
  });
  const groups = new Map<string, { sector: string; kind: string; label: string; certainty: string; ids: Set<string> }>();
  for (const signal of signals) {
    const row = rows.find(r => r.id === signal.opportunityId);
    if (!row || !["pain", "objection", "product_request"].includes(signal.kind)) continue;
    const label = signal.normalizedLabel.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
    const key = JSON.stringify([row.sector, signal.kind, label, signal.certainty]);
    if (!groups.has(key)) groups.set(key, { sector: row.sector, kind: signal.kind, label, certainty: signal.certainty, ids: new Set() });
    groups.get(key)!.ids.add(row.id);
  }
  const themes = [...groups.values()].map(g => {
    const sectorRows = rows.filter(r => r.sector === g.sector);
    const respondentCount = sectorRows.filter(r => respondents.has(r.id)).length;
    return { sector: g.sector, kind: g.kind, label: g.label, certainty: g.certainty, count: g.ids.size, denominator: sectorRows.length,
      respondentHits: [...g.ids].filter(id => respondents.has(id)).length, respondentCount };
  }).sort((a,b) => b.count-a.count || a.label.localeCompare(b.label));
  const lost = rows.filter(r => r.stage === "lost");
  const losses = [...new Set(lost.map(r => r.lostReason?.trim().toLocaleLowerCase("pt-BR") || "Sem motivo registrado"))].map(reason => ({
    reason, count: lost.filter(r => (r.lostReason?.trim().toLocaleLowerCase("pt-BR") || "Sem motivo registrado") === reason).length, denominator: lost.length,
  }));
  const campaigns = [...new Set(rows.map(r => r.campaignId))].map(id => {
    const members = rows.filter(r => r.campaignId === id);
    return { id, name: members[0].campaignName, count: members.length, won: members.filter(r => r.stage === "won").length, lost: members.filter(r => r.stage === "lost").length };
  });
  return { total: rows.length, respondents: respondents.size, stages, milestones, themes, losses, campaigns };
}
