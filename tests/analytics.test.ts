import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, type CohortRow } from "../src/lib/analytics/aggregate";
import { analyticsFilters, armResult, DAY, experimentInput, rateText, wilson, type Event } from "../src/lib/analytics/contracts";

const start=new Date("2026-09-01T00:00:00Z");
const event=(id:string,kind="inbound_message",offset=1):Event=>({opportunityId:id,kind,happenedAt:new Date(+start+offset*DAY),createdAt:new Date(+start+offset*DAY),deletedAt:null,metadata:{}});
const rows:CohortRow[]=[{id:"a",stage:"won",sector:"Contabilidade",campaignId:"c",campaignName:"Piloto",lostReason:null},{id:"b",stage:"lost",sector:"Contabilidade",campaignId:"c",campaignName:"Piloto",lostReason:"Sem orçamento"},{id:"c",stage:"contacted",sector:"Tecnologia",campaignId:"d",campaignName:"Outro",lostReason:null}];
test("base e distribuição fecham; repetição de resposta não duplica o funil",()=>{
  const result=aggregate(rows,[event("a"),event("a"),event("outside"),{...event("b"),deletedAt:new Date()}],[]);
  assert.equal(result.total,3);assert.equal(result.stages.reduce((n,s)=>n+s.count,0),3);
  assert.equal(result.respondents,1);assert.equal(result.milestones.find(m=>m.metric==="replied")?.count,1);
  assert.equal(result.milestones.find(m=>m.metric==="won")?.count,0,"não inferir marcos pelo estágio atual");
  assert.deepEqual(result.losses,[{reason:"sem orçamento",count:1,denominator:1}]);
});
test("temas separam inferência, segmento, população e respondentes, sem duplicar oportunidades",()=>{
  const signal={opportunityId:"a",kind:"pain",normalizedLabel:"  Falta   tempo ",certainty:"explicit"};
  const result=aggregate(rows,[event("a")],[signal,signal,{...signal,opportunityId:"b"},{...signal,certainty:"inferred"},{...signal,opportunityId:"c"}]);
  const t=result.themes.find(t=>t.sector==="Contabilidade"&&t.certainty==="explicit")!;
  assert.equal(t.count,2);assert.equal(t.denominator,2);assert.equal(t.respondentCount,1);assert.equal(t.respondentHits,1);assert.equal(result.themes.length,3);
});
test("base vazia não produz porcentagens inventadas",()=>{
  assert.equal(aggregate([],[],[]).milestones[0].percent,null);assert.equal(rateText(0,0),"0/0 · sem base");assert.equal(wilson(0,0),null);
  assert.ok(wilson(0,30)![1]>0);assert.ok(wilson(30,30)![0]<100);
});
test("experimento usa janela completa, limites exclusivos e mantém não respondentes",()=>{
  const members=[{opportunityId:"a",createdAt:start},{opportunityId:"b",createdAt:start},{opportunityId:"pending",createdAt:new Date(+start+13*DAY)}];
  const result=armResult(members,[event("a"),event("a", "inbound_message",2),event("b","inbound_message",14),event("pending","inbound_message",13)],"replied",14,new Date(+start+15*DAY));
  assert.equal(result.successes,1);assert.equal(result.denominator,2);assert.equal(result.pending,1);assert.equal(result.percent,50);
});
test("evento anterior, apagado ou marco diferente não conta como sucesso",()=>{
  const members=[{opportunityId:"a",createdAt:start}];
  const result=armResult(members,[event("a","inbound_message",-1),{...event("a"),deletedAt:start},{...event("a","stage_changed"),metadata:{to:"meeting"}}],"replied",14,new Date(+start+15*DAY));
  assert.equal(result.successes,0);assert.equal(result.denominator,1);
});
test("validação rejeita filtros invertidos, datas inválidas e protocolos com amostra menor que 30",()=>{
  assert.equal(analyticsFilters.safeParse({from:"2026-09-30",to:"2026-09-01"}).success,false);
  assert.equal(analyticsFilters.safeParse({from:"2026-02-30"}).success,false);
  const input={requestKey:crypto.randomUUID(),campaignId:crypto.randomUUID(),name:"Teste A/B",hypothesis:"Uma pergunta curta aumenta respostas",variantA:"Pergunta curta",variantB:"Pergunta longa",metric:"replied",windowDays:14,minPerArm:30,enrollmentEnds:"2026-10-01",confirmation:"predefined_protocol"};
  assert.equal(experimentInput.safeParse(input).success,true);assert.equal(experimentInput.safeParse({...input,minPerArm:5}).success,false);assert.equal(experimentInput.safeParse({...input,variantB:input.variantA}).success,false);
});
