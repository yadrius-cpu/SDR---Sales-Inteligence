import { test } from "node:test";
import assert from "node:assert/strict";
import { approveInput,assertReachable,composeDraft,contactInput,normalizeName,normalizeProfile,sentInput } from "../src/lib/outreach/contracts";
const product={name:"PhishShield",approvedClaims:[],prohibitedClaims:["WhatsApp","Anexos"]};
test("catálogo vazio gera discovery genérico, sem promessa de capacidade",()=>{
  for(const persona of ["small_business","technical"] as const){const draft=composeDraft({name:"Pessoa fictícia",company:"Empresa fictícia",persona,product,claimIndex:""});assert.equal(draft.isGeneric,true);assert.doesNotMatch(draft.message,/WhatsApp|Anexos|detecta|protege|garante|vazamento/i);assert.match(draft.message,persona==="technical"?/ferramentas/:/quem costuma ajudar/);}
});
test("geração usa apenas alegação selecionada do catálogo e fato fornecido",()=>{
  const input={name:"Pessoa",company:"Empresa",persona:"technical" as const,product:{...product,approvedClaims:["Capacidade de teste validada"]},claimIndex:0,fact:{claim:"Possui unidade em uma cidade"}};
  const result=composeDraft(input);assert.equal(result.isGeneric,false);assert.match(result.message,/Capacidade de teste validada/);assert.match(result.message,/Possui unidade/);assert.throws(()=>composeDraft({...input,claimIndex:1}));
});
test("aprovação e confirmação exigem atestações explícitas e chave de replay",()=>{
  assert.equal(approveInput.safeParse({version:1}).success,false);assert.equal(approveInput.safeParse({version:1,attestation:"reviewed"}).success,true);
  assert.equal(sentInput.safeParse({version:1,confirmation:"copied"}).success,false);assert.equal(sentInput.safeParse({version:1,confirmation:"sent_manually",requestKey:"00000000-0000-4000-8000-000000000001",followUpDays:0}).success,false);
});
test("opt-out e oportunidades encerradas impedem novos contatos",()=>{
  assert.throws(()=>assertReachable({doNotContactAt:new Date()},"contacted"));for(const stage of ["do_not_contact","lost","won","not_fit"])assert.throws(()=>assertReachable({doNotContactAt:null},stage));assert.doesNotThrow(()=>assertReachable({doNotContactAt:null},"ready_for_review"));
});
test("dedupe normaliza nome e perfil LinkedIn; origem não aceita script",()=>{
  assert.equal(normalizeName("  José   Silva "),"jose silva");assert.equal(normalizeProfile("http://www.linkedin.com/in/JOSE/?trk=x#top"),"https://linkedin.com/in/jose");
  assert.equal(contactInput.safeParse({name:"Pessoa",title:"Sócio",roleCategory:"owner",sourceUrl:"javascript:alert(1)",permittedBasis:"Permissão de teste",purpose:"Finalidade de teste"}).success,false);
});
