import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db,pool } from "../src/db";
import { companies,campaigns,auditEvents } from "../src/db/schema";
const origin=process.env.APP_ORIGIN!;
const ids:string[]=[];
const cookies:string[]=[];
async function call(path:string,method="GET",body?:unknown,cookie="",requestOrigin=origin){return fetch(`${origin}/api/v1/${path}`,{method,headers:{origin:requestOrigin,"Content-Type":"application/json",cookie},body:body===undefined?undefined:JSON.stringify(body)});}
async function login(role:string){const result=await call("auth/login","POST",{email:`${role}@demo.invalid`,password:process.env.SEED_PASSWORD});assert.equal(result.status,200);const header=result.headers.get("set-cookie")!;assert.match(header,/HttpOnly/i);assert.match(header,/SameSite=lax/i);const cookie=header.split(";")[0];cookies.push(cookie);return cookie;}
async function main(){
  assert.equal((await call("companies")).status,401);
  assert.equal((await call("auth/login","POST",{},"","https://invalid.example")).status,403);
  const owner=await login("owner"),operator=await login("operator"),viewer=await login("viewer");
  assert.equal((await call("admin/users","GET",undefined,owner)).status,200);
  assert.equal((await call("admin/users","GET",undefined,operator)).status,403);
  assert.equal((await call("companies","POST",{},viewer)).status,403);
  assert.equal((await call("companies?page=-1","GET",undefined,viewer)).status,400);
  const domain=`${randomUUID()}.invalid`;
  const payload={displayName:"Teste automatizado fictício",domain,sector:"Contabilidade"};
  for(const allowSharedDomain of [false,true]){const response=await call("companies","POST",{...payload,allowSharedDomain},operator);assert.equal(response.status,201);ids.push((await response.json()).data.id);if(!allowSharedDomain)assert.equal((await call("companies","POST",payload,operator)).status,409);}
  const withoutDomain=await call("companies","POST",{displayName:"Sem domínio (teste)",sector:"Contabilidade"},operator);assert.equal(withoutDomain.status,201);ids.push((await withoutDomain.json()).data.id);
  const catalog=await (await call("products","GET",undefined,owner)).json();
  const campaign=await call("campaigns","POST",{productId:catalog.data[0].id,name:"Campanha de teste",sector:"Contabilidade",employeeMin:5,employeeMax:50},operator);assert.equal(campaign.status,201);ids.push((await campaign.json()).data.id);
  for(const path of ["/","/companies","/campaigns","/admin"]){const response=await fetch(`${origin}${path}`,{headers:{cookie:owner}});assert.equal(response.status,200);assert.match(await response.text(),/PhishShield|PHISHSHIELD/);}
  const audit=await db.select().from(auditEvents).where(inArray(auditEvents.entityId,ids));assert.equal(audit.length,4);
  await call("auth/logout","POST",{},viewer);assert.equal((await call("me","GET",undefined,viewer)).status,401);
  console.log("Smoke HTTP aprovado: login de 3 perfis, cookies, CSRF, RBAC, paginação, persistência, conflito de domínio, domínio compartilhado, cadastro sem domínio, campanha, 4 telas, auditoria e logout.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const cookie of cookies)await call("auth/logout","POST",{},cookie);if(ids.length){await db.delete(auditEvents).where(inArray(auditEvents.entityId,ids));await db.delete(companies).where(inArray(companies.id,ids));await db.delete(campaigns).where(inArray(campaigns.id,ids));}await pool.end();});
