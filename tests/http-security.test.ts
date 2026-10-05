import test from "node:test";
import assert from "node:assert/strict";
import { boundedJson, BodyError } from "../src/lib/http-security";
import { hashPassword,verifyPasswordAsync } from "../src/lib/security";
const request=(body:BodyInit,type="application/json")=>new Request("http://localhost/test",{method:"POST",headers:{"content-type":type},body,duplex:"half"} as RequestInit);
test("corpo em streaming é interrompido acima do limite, sem aguardar fim",async()=>{
  let cancelled=false;
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(1025));},cancel(){cancelled=true;}});
  await assert.rejects(boundedJson(request(stream),1024),e=>e instanceof BodyError&&e.status===413);assert.ok(cancelled);
});
test("leitura lenta tem prazo total",async()=>{
  let cancelled=false;const stream=new ReadableStream({cancel(){cancelled=true;}});
  await assert.rejects(boundedJson(request(stream),1024,20),e=>e instanceof BodyError&&e.status===408);assert.ok(cancelled);
});
test("JSON válido funciona; codificação, tipos e JSON inválidos são rejeitados",async()=>{
  assert.deepEqual(await boundedJson(request('{"ok":true}'),100),{ok:true});
  await assert.rejects(boundedJson(request('{}',"text/plain"),100),e=>e instanceof BodyError&&e.status===415);
  await assert.rejects(boundedJson(request('{'),100),e=>e instanceof BodyError&&e.status===400);
  await assert.rejects(boundedJson(request(new Uint8Array([0xff])),100),e=>e instanceof BodyError&&e.status===400);
  await assert.rejects(boundedJson(request('{"name":"\\u0000"}'),100),e=>e instanceof BodyError&&e.status===400);
  await assert.rejects(boundedJson(request('['.repeat(50)+'0'+']'.repeat(50)),200),e=>e instanceof BodyError&&e.status===400);
});
test("verificação assíncrona mantém o formato e a comparação de senha",async()=>{
  const hash=hashPassword("synthetic-password");assert.equal(await verifyPasswordAsync("synthetic-password",hash),true);assert.equal(await verifyPasswordAsync("wrong",hash),false);
});
