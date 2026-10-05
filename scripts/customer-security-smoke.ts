import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const origin = process.env.SECURITY_TEST_ORIGIN ?? process.env.APP_ORIGIN!;
const headers = {origin,"Content-Type":"application/json"};
async function call(path:string,method="GET",body?:unknown,cookie="") {
  return fetch(origin+"/api/v1/"+path,{method,headers:{...headers,cookie},body:body===undefined?undefined:JSON.stringify(body)});
}
async function register(tag:string) {
  const response = await call("auth/register","POST",{name:"Cliente "+tag,email:tag+"@example.invalid",password:"senha-de-teste-com-12",companyName:"Empresa "+tag,domain:tag+".example.invalid",sector:"Serviços"});
  assert.equal(response.status,201);
  return response.headers.get("set-cookie")!.split(";")[0];
}
async function main() {
  const a = await register("tenant-a-"+randomUUID().slice(0,8)), b = await register("tenant-b-"+randomUUID().slice(0,8));
  const created = await call("customer/leads","POST",{companyName:"Lead privado A",domain:"lead-a.example.invalid",contactName:"Contato A"},a);
  assert.equal(created.status,201);
  const lead = (await created.json()).data;
  const listB = await call("customer/leads","GET",undefined,b);
  assert.equal(listB.status,200);
  assert.equal((await listB.json()).data.length,0);
  const crossEdit = await call("customer/leads/"+lead.id+"/edit","POST",{companyName:"Tentativa indevida",status:"new"},b);
  assert.equal(crossEdit.status,404);
  const internal = await call("companies","GET",undefined,b);
  assert.equal(internal.status,403);
  const insightsB = await call("customer/insights","GET",undefined,b);
  assert.equal(insightsB.status,200);
  console.log("Customer security smoke aprovado: isolamento entre dois tenants, IDOR de edição bloqueado e CRM interno inacessível.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
