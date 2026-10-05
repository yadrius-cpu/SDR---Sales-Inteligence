import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { loginAttempts } from "../src/db/schema";
import { GLOBAL_LOGIN_KEY } from "../src/lib/login-limits";
import { entityUrl,isPublicIpv4 } from "../src/lib/research/wikidata";

type Check=(name:string,passed:boolean,observed:unknown)=>void;
type Api=(path:string,method?:string,body?:unknown,cookie?:string,requestOrigin?:string|null)=>Promise<Response>;
export async function securityMatrix(origin:string,api:Api,check:Check,cookies:{operator:string;viewer:string;owner:string},companyId:string){
  const id=randomUUID(),c=companyId;
  const mutations=["companies",`companies/${c}/edit`,`companies/${c}/campaigns`,"campaigns",`campaigns/${id}/edit`,"companies/import",`companies/imports/${id}/commit`,
    `companies/${c}/contacts`,`contacts/${id}/edit`,`contacts/${id}/opt-out`,"opportunities",`opportunities/${id}/owner`,`opportunities/${id}/stage`,`opportunities/${id}/conversation-stage`,
    `opportunities/${id}/drafts`,`opportunities/${id}/tasks`,...(["edit","approve","reject","copy-content","copied","confirm-sent","generate-text"].map(a=>`drafts/${id}/${a}`)),`tasks/${id}/status`,
    `companies/${c}/evidence`,`companies/${c}/evidence/${id}/edit`,`companies/${c}/evidence/${id}/review`,`companies/${c}/briefs`,`companies/${c}/briefs/${id}/edit`,`companies/${c}/briefs/${id}/review`,`companies/${c}/research`,
    "activities",...(["edit","erase","insights","extract-insights"].map(a=>`activities/${id}/${a}`)),`conversation-insights/${id}/edit`,`conversation-insights/${id}/review`,"experiments",`experiments/${id}/enroll`,"admin/research-source",`admin/products/${id}/claims`];
  for(const path of mutations){
    for(const [label,cookie,requestOrigin,status] of [["anonymous","",origin,401],["viewer",cookies.viewer,origin,403],["CSRF",cookies.operator,"https://attacker.invalid",403]] as const){
      const r=await api(path,"POST",{},cookie,requestOrigin);check(`${label} POST ${path.replaceAll(id,"{id}").replaceAll(c,"{company}")}`,r.status===status,r.status);await r.body?.cancel();
    }
  }
  const reads=["me","companies","campaigns","products","crm/assignees","pipeline","analytics","experiments",`experiments/${id}`,`companies/${c}`,`companies/${c}/contacts`,`companies/${c}/evidence`,`companies/${c}/briefs`,"opportunities",`opportunities/${id}`,`opportunities/${id}/conversation`,`opportunities/${id}/next-action`,"outreach/queue","tasks","research/review-queue",`drafts/${id}`];
  for(const path of reads){const r=await api(path);check(`anonymous GET ${path.replaceAll(id,"{id}").replaceAll(c,"{company}")}`,r.status===401,r.status);await r.body?.cancel();}
  for(const path of ["admin/users","admin/audit","admin/research-source"]){for(const cookie of [cookies.operator,cookies.viewer]){const r=await api(path,"GET",undefined,cookie);check(`admin read restricted ${path}`,r.status===403,r.status);await r.body?.cancel();}}
  for(const method of ["PUT","PATCH","DELETE"]){const r=await fetch(`${origin}/api/v1/companies`,{method,headers:{cookie:cookies.operator,origin}});check(`unsupported method ${method}`,r.status===405,r.status);await r.body?.cancel();}
  for(const path of ["/analytics","/experiments","/companies","/campaigns","/pipeline","/tasks","/admin","/admin/ai","/admin/catalog"]){
    const r=await fetch(origin+path,{redirect:"manual"});check(`page unauthenticated ${path}`,[303,307,308].includes(r.status)&&r.headers.get("location")==="/login",{status:r.status,location:r.headers.get("location")});await r.body?.cancel();
  }
  for(const path of ["/companies?q=%00","/pipeline?q=%00","/analytics?sector=%00"]){const r=await fetch(origin+path,{headers:{cookie:cookies.operator}});const html=await r.text();check(`page rejects null character ${path}`,r.status===200&&html.includes("Filtros inválidos"),r.status);}
  for(const headers of [{"x-middleware-subrequest":"middleware:middleware:middleware:middleware:middleware"},{"x-middleware-subrequest":"src/proxy:src/proxy:src/proxy:src/proxy:src/proxy"},{"x-user-role":"owner","x-user-id":id},{"x-forwarded-host":"attacker.invalid","x-forwarded-proto":"https"}]){
    const r=await fetch(origin+"/api/v1/admin/users",{headers:Object.fromEntries(Object.entries(headers).filter((entry):entry is [string,string]=>typeof entry[1]==="string"))});check("forged identity/proxy headers do not authorize",r.status===401,r.status);await r.body?.cancel();
  }
  for(const q of ["' OR 1=1 --","%","_","\\","'; SELECT pg_sleep(2); --","<svg/onload=alert(1)>","\u0000"]){
    const r=await api("companies?q="+encodeURIComponent(q),"GET",undefined,cookies.operator);const body=await r.text();
    check(`search literal ${JSON.stringify(q)}`,r.status===200||r.status===400,{status:r.status,noInternalDetails:!/(password_hash|SELECT .* FROM|node_modules|DATABASE_URL)/i.test(body)});
  }
  for(const path of ["companies?page=-1","companies?page=NaN","companies?page=1000000000","analytics?campaignId=bad-id","analytics?from=2026-02-30","experiments/not-a-uuid","companies/not-a-uuid","opportunities/not-a-uuid/conversation"]){const r=await api(path,"GET",undefined,cookies.operator);check(`invalid input ${path}`,r.status===400,r.status);await r.body?.cancel();}
  for(const raw of ["{", "null", "[]", '"text"', '{"__proto__":{"role":"owner"}}', '{"displayName":{"$ne":null},"sector":"test"}']){
    const r=await fetch(origin+"/api/v1/companies",{method:"POST",headers:{cookie:cookies.operator,origin,"content-type":"application/json"},body:raw});check(`malformed/schema input ${raw}`,r.status===400,r.status);await r.body?.cancel();
  }
  for(const type of ["text/plain","application/x-www-form-urlencoded","multipart/form-data"]){const r=await fetch(origin+"/api/v1/companies",{method:"POST",headers:{cookie:cookies.operator,origin,"content-type":type},body:"{}"});check(`content type ${type}`,r.status===415,r.status);await r.body?.cancel();}
  for(const suffix of [".attacker.invalid","@attacker.invalid","/"," null"]){const r=await api("companies","POST",{},cookies.operator,origin+suffix);check(`Origin exact match ${suffix}`,r.status===403,r.status);await r.body?.cancel();}
  for(const path of ["/api/v1/admin%2Fusers","/api/v1/companies/../admin/users","/api/v1//admin/users"]){const r=await fetch(origin+path,{headers:{cookie:cookies.operator},redirect:"manual"});check(`path normalization ${path}`,r.status!==200,{status:r.status});await r.body?.cancel();}
  const cors=await fetch(origin+"/api/v1/companies",{method:"OPTIONS",headers:{origin:"https://attacker.invalid","access-control-request-method":"POST","access-control-request-headers":"content-type"}});check("CORS does not authorize attacker",!cors.headers.has("access-control-allow-origin"),{status:cors.status});await cors.body?.cancel();
  const cache=await api("me","GET",undefined,cookies.operator);check("authenticated API is not cacheable",/no-store/.test(cache.headers.get("cache-control")??""),cache.headers.get("cache-control"));await cache.body?.cancel();
  for(const host of ["127.0.0.1","10.0.0.1","169.254.169.254","172.16.0.1","192.168.0.1","100.64.0.1","0.0.0.0","::1","::ffff:127.0.0.1","198.18.0.1","224.0.0.1"]){check(`SSRF DNS guard ${host}`,!isPublicIpv4(host),"pure function; no request to target");}
  for(const input of ["http://127.0.0.1", "Q1/../../.env","Q1?url=http://169.254.169.254","Q0","Q1\r\nHost: localhost"]){let rejected=false;try{entityUrl(input);}catch{rejected=true;}check(`SSRF entity input ${JSON.stringify(input)}`,rejected,"no outbound request");}
  // Isolated lab only: exercise the global limiter at its persisted boundary, no flood required.
  await db.insert(loginAttempts).values({key:GLOBAL_LOGIN_KEY,count:60,windowStart:new Date()}).onConflictDoUpdate({target:loginAttempts.key,set:{count:60,windowStart:new Date()}});
  try{const r=await api("auth/login","POST",{email:`${id}@example.invalid`,password:"synthetic-password"});check("global login gate blocks a new account at shared limit",r.status===429,r.status);await r.body?.cancel();}
  finally{await db.delete(loginAttempts).where(eq(loginAttempts.key,GLOBAL_LOGIN_KEY));}
}
