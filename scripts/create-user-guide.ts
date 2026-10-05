import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomBytes,randomUUID } from "node:crypto";
import { spawn,type ChildProcess } from "node:child_process";
import { mkdir,writeFile,readFile,readdir } from "node:fs/promises";
import { chromium,type Browser,type Page } from "playwright";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { hashPassword } from "../src/lib/security";
import { buildManual } from "./manual-content";

const output="docs/manual",origin="http://127.0.0.1:3002",databaseName=`manual_lab_${randomBytes(8).toString("hex")}`;
const source=new URL(process.env.DATABASE_URL!);
if(!["127.0.0.1","localhost"].includes(source.hostname))throw Error("Only local PostgreSQL is supported.");
const password=randomBytes(24).toString("hex"),labUrl=new URL(source);labUrl.pathname=`/${databaseName}`;
const admin=new Pool({connectionString:source.toString()}),pool=new Pool({connectionString:labUrl.toString()});
const db=drizzle(pool,{schema});let created=false,server:ChildProcess|undefined,browser:Browser|undefined;
const DAY=86400000,now=new Date(),ago=(days:number)=>new Date(+now-days*DAY);
const screenshots:Record<string,string>={};
async function seed(){
  const [owner]=await db.insert(schema.users).values({email:"manual@example.invalid",name:"Equipe de demonstração",role:"owner",passwordHash:hashPassword(password)}).returning();
  const [product]=await db.insert(schema.products).values({name:"PhishShield",description:"Catálogo de demonstração. Capacidades comerciais ainda aguardam validação.",approvedClaims:[],prohibitedClaims:["Funcionalidades sem validação no catálogo","Resultados ou garantias sem comprovação"]}).returning();
  const [campaign,otherCampaign]=await db.insert(schema.campaigns).values([
    {name:"Piloto · Contabilidades",sector:"Contabilidade",productId:product.id,employeeMin:5,employeeMax:50,geography:"Brasil",targetRoles:["Sócios","Direção"],status:"active",ownerId:owner.id,inclusionCriteria:"Escritórios contábeis de 5 a 50 funcionários",exclusionCriteria:"Empresas fora do segmento"},
    {name:"Pesquisa · Serviços profissionais",sector:"Serviços",productId:product.id,employeeMin:10,employeeMax:100,geography:"Brasil",targetRoles:["Gestão"],status:"draft",ownerId:owner.id},
  ]).returning();
  const names=["Aurora Contabilidade","Horizonte Contábil","Ponto Norte Assessoria","Caminho Contábil","Vértice Consultoria","Essencial Contabilidade","Lume Serviços"];
  const stages=["ready_for_review","contacted","replied","meeting","won","lost","contact_identified"] as const;
  const companies=await db.insert(schema.companies).values(names.map((name,i)=>({displayName:`${name} (exemplo)`,domainNormalized:`empresa-${i}.example.invalid`,sector:i===6?"Serviços":"Contabilidade",ownerId:owner.id,city:"São Paulo",state:"SP",employeeEstimate:10+i*4,createdAt:ago(28-i),sourceUrl:"https://example.invalid/manual",permittedBasis:"Registro inteiramente fictício para o manual"}))).returning();
  const people=await db.insert(schema.contacts).values(companies.map((c,i)=>({companyId:c.id,name:["Marina Costa","Rafael Lima","Paula Alves","Lucas Dias","Clara Reis","Bruno Melo","Ana Souza"][i]+" (exemplo)",nameNormalized:`pessoa exemplo ${i}`,title:i%2?"Diretor":"Sócia",roleCategory:"owner",contactStatus:i>0&&i<6?"contacted":"not_contacted",sourceUrl:"https://example.invalid/manual",permittedBasis:"Pessoa fictícia para demonstração",purpose:"Ensinar a operação da ferramenta",createdBy:owner.id}))).returning();
  const opportunities=await db.insert(schema.opportunities).values(companies.map((c,i)=>({companyId:c.id,campaignId:i===6?otherCampaign.id:campaign.id,primaryContactId:people[i].id,ownerId:owner.id,stage:stages[i],createdAt:ago(22-i),wonAt:i===4?ago(2):null,wonReference:i===4?"Fechamento fictício para o manual":null,lostReason:i===5?"Sem orçamento neste período (exemplo)":null}))).returning();
  await db.insert(schema.campaignCompanies).values(companies.map((c,i)=>({companyId:c.id,campaignId:i===6?otherCampaign.id:campaign.id,addedBy:owner.id})));
  const [sourceRow]=await db.insert(schema.sources).values({companyId:companies[0].id,sourceType:"manual",url:"https://example.invalid/manual",publisher:"Exemplo do manual",permittedBasis:"Conteúdo fictício para demonstração",contentHash:"manual-fixture",createdBy:owner.id}).returning();
  await db.insert(schema.evidence).values([
    {companyId:companies[0].id,type:"public_fact",claim:"Exemplo fictício: o escritório presta serviços contábeis para pequenas empresas.",sourceId:sourceRow.id,observedAt:ago(3),confidenceLabel:"Exemplo didático com fonte de demonstração",status:"approved",reviewedBy:owner.id,reviewedAt:ago(2),createdBy:owner.id},
    {companyId:companies[0].id,type:"inference",claim:"Hipótese de exemplo: a equipe pode concentrar a triagem de mensagens em uma pessoa.",observedAt:ago(3),confidenceLabel:"Hipótese não confirmada",status:"pending",createdBy:owner.id},
    {companyId:companies[0].id,type:"unknown",claim:"Ainda não sabemos quem cuida das mensagens suspeitas.",observedAt:ago(3),confidenceLabel:"Informação não conhecida",status:"pending",createdBy:owner.id},
  ]);
  const text="Hoje usamos um processo manual. Perdemos tempo na triagem de mensagens suspeitas. Gostaria de entender melhor a proposta antes de marcar uma reunião.";
  const [message]=await db.insert(schema.activities).values({opportunityId:opportunities[2].id,contactId:people[2].id,kind:"inbound_message",channel:"linkedin",body:text,authorRole:"contact",authorId:owner.id,permittedBasis:"Conversa fictícia para o manual",happenedAt:ago(1),requestKey:randomUUID()}).returning();
  await db.insert(schema.conversationInsights).values([
    {activityId:message.id,activityVersion:1,kind:"pain",normalizedLabel:"Tempo gasto na triagem manual",rawExcerpt:"Perdemos tempo na triagem de mensagens suspeitas.",certainty:"explicit",method:"manual",fingerprint:randomUUID(),status:"approved",reviewedBy:owner.id,reviewedAt:now,reviewNote:"Trecho conferido no exemplo fictício."},
    {activityId:message.id,activityVersion:1,kind:"intent",normalizedLabel:"Interesse em entender a proposta",rawExcerpt:"Gostaria de entender melhor a proposta antes de marcar uma reunião.",certainty:"inferred",method:"local_keyword_candidates_v1",fingerprint:randomUUID(),status:"pending"},
  ]);
  for(let i=1;i<6;i++){
    await db.insert(schema.activities).values({opportunityId:opportunities[i].id,contactId:people[i].id,kind:"stage_changed",channel:"internal",authorId:owner.id,happenedAt:ago(5),metadata:{from:"ready_for_review",to:"contacted",reason:"Contato fictício registrado para o manual"}});
    if(i>=2)await db.insert(schema.activities).values({opportunityId:opportunities[i].id,kind:"stage_changed",channel:"internal",authorId:owner.id,happenedAt:ago(3),metadata:{from:"contacted",to:stages[i],reason:"Exemplo de atualização revisada do estágio"}});
  }
  await db.insert(schema.tasks).values([
    {opportunityId:opportunities[2].id,contactId:people[2].id,assigneeId:owner.id,dueAt:new Date(+now+DAY),description:"Revisar a resposta e preparar uma pergunta de continuidade."},
    {opportunityId:opportunities[1].id,contactId:people[1].id,assigneeId:owner.id,dueAt:ago(1),description:"Conferir se houve resposta antes de planejar novo contato."},
  ]);
  const [draft]=await db.insert(schema.outreachDrafts).values({opportunityId:opportunities[0].id,contactId:people[0].id,persona:"small_business",message:"Olá, Marina. Gostaria de entender como o escritório lida hoje com mensagens suspeitas. Quem costuma participar dessa avaliação por aí?",productId:product.id,productVersion:1,productSnapshot:{name:product.name,approvedClaims:[],prohibitedClaims:product.prohibitedClaims},evidenceSnapshot:[],isGeneric:true,rationale:"Pergunta inicial de descoberta. Nenhuma dor ou funcionalidade é presumida.",templateVersion:"manual_example_v1",createdBy:owner.id}).returning();
  const [experiment]=await db.insert(schema.experiments).values({requestKey:randomUUID(),campaignId:campaign.id,name:"Pergunta curta ou contextualizada?",hypothesis:"Exemplo: uma pergunta inicial mais curta pode facilitar a resposta.",variantA:"Perguntar quem participa da avaliação de mensagens suspeitas.",variantB:"Apresentar brevemente o contexto e perguntar como ocorre essa avaliação.",metric:"replied",windowDays:14,minPerArm:30,enrollmentEnds:new Date(+now+7*DAY),createdBy:owner.id}).returning();
  await db.insert(schema.experimentMembers).values([0,1,2,3].map((i)=>({experimentId:experiment.id,opportunityId:opportunities[i].id,companyId:companies[i].id,arm:i%2?"B":"A",createdAt:ago(i===0?2:18),createdBy:owner.id})));
  return {owner,campaign,companies,people,opportunities,draft,experiment};
}
async function waitForServer(){
  for(let i=0;i<40;i++){try{const r=await fetch(origin+"/login",{signal:AbortSignal.timeout(1000)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}
  throw Error("Manual server did not start.");
}
async function capture(page:Page,key:string,url:string,options:{anchor?:string;selector?:string;full?:boolean;prepare?:()=>Promise<void>}={}){
  await page.goto(origin+url,{waitUntil:"networkidle"});await page.locator("h1").first().waitFor();if(options.prepare)await options.prepare();
  if(options.anchor){const target=page.getByRole("heading",{name:options.anchor,exact:true}).first();await target.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-26));}
  if(options.selector)await page.locator(options.selector).evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-26));
  await page.screenshot({path:`${output}/imagens/${key}.png`,...(options.full?{}:{clip:{x:270,y:options.anchor||options.selector?0:88,width:980,height:480}})});
  screenshots[key]=`data:image/png;base64,${(await readFile(`${output}/imagens/${key}.png`)).toString("base64")}`;
  console.log(`Captured: ${key}`);
}
async function main(){
  await mkdir(`${output}/imagens`,{recursive:true});await mkdir("test-results",{recursive:true});
  await admin.query(`CREATE DATABASE "${databaseName}"`);created=true;
  await migrate(db,{migrationsFolder:"drizzle"});const fixture=await seed();
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3002"],{windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,NODE_ENV:"production",DATABASE_URL:labUrl.toString(),APP_ORIGIN:origin,AI_ENABLED:"false",CLAUDE_WRITING_ENABLED:"false",OPENAI_WRITING_ENABLED:"false"}});
  server.stdout?.on("data",()=>{});server.stderr?.on("data",()=>{});await waitForServer();
  browser=await chromium.launch({channel:"msedge",headless:true});const context=await browser.newContext({viewport:{width:1280,height:760},deviceScaleFactor:1.5,locale:"pt-BR",timezoneId:"America/Sao_Paulo"});
  await context.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage();await page.goto(origin+"/login");await page.screenshot({path:`${output}/imagens/login.png`});screenshots.login=`data:image/png;base64,${(await readFile(`${output}/imagens/login.png`)).toString("base64")}`;
  const login=await context.request.post(origin+"/api/v1/auth/login",{headers:{origin},data:{email:"manual@example.invalid",password}});if(!login.ok())throw Error("Manual login failed.");
  const cookie=login.headers()["set-cookie"].split(";")[0];await context.addCookies([{name:cookie.split("=")[0],value:cookie.slice(cookie.indexOf("=")+1),url:origin}]);
  const f=fixture;
  if(process.argv.includes("--refresh-pipeline")){
    for(const file of await readdir(`${output}/imagens`))if(file.endsWith(".png"))screenshots[file.slice(0,-4)]=`data:image/png;base64,${(await readFile(`${output}/imagens/${file}`)).toString("base64")}`;
    await capture(page,"pipeline","/pipeline",{selector:".pipeline-board",prepare:async()=>{await page.locator(".pipeline-board").evaluate(el=>{el.scrollLeft=820;});}});
  }else{
  await capture(page,"visao-geral","/",{full:true});
  await capture(page,"empresas","/companies",{anchor:"Cadastros"});
  await capture(page,"campanhas","/campaigns");
  await capture(page,"cadastro",`/companies/${f.companies[0].id}/manage`,{anchor:"Cadastro de "+f.companies[0].displayName});
  await capture(page,"pesquisa","/research");
  await capture(page,"evidencias",`/companies/${f.companies[0].id}`,{anchor:"Ficha de evidências"});
  await capture(page,"contatos",`/companies/${f.companies[0].id}/outreach`,{anchor:"Contatos"});
  await capture(page,"oportunidade",`/opportunities/${f.opportunities[0].id}`);
  await capture(page,"pipeline","/pipeline",{selector:".pipeline-board",prepare:async()=>{const board=page.locator(".pipeline-board");await board.evaluate(el=>{el.scrollLeft=820;});}});
  await capture(page,"abordagens","/outreach");
  await capture(page,"rascunho",`/drafts/${f.draft.id}`);
  await capture(page,"redacao-ia",`/drafts/${f.draft.id}`,{anchor:"Redigir com IA",prepare:async()=>{const summary=page.locator("summary").filter({hasText:"Redigir com IA"});if(await summary.count())await summary.click();}});
  await db.update(schema.outreachDrafts).set({status:"approved",approvedBy:f.owner.id,approvedAt:now}).where(eq(schema.outreachDrafts.id,f.draft.id));
  await capture(page,"copiar-enviar",`/drafts/${f.draft.id}`,{anchor:"Revisar e preparar"});
  await capture(page,"conversas",`/opportunities/${f.opportunities[2].id}/conversation`);
  await capture(page,"insights-conversa",`/opportunities/${f.opportunities[2].id}/conversation`,{anchor:"Interpretações para revisar"});
  await capture(page,"tarefas","/tasks");
  await capture(page,"analises","/analytics",{anchor:"Funil: marcos registrados"});
  await capture(page,"temas","/analytics",{anchor:"Dores, objeções e pedidos de produto"});
  await capture(page,"experimentos",`/experiments/${f.experiment.id}`,{anchor:"Resultados observados"});
  await capture(page,"administracao","/admin");
  await capture(page,"catalogo","/admin/catalog");
  await capture(page,"configuracao-ia","/admin/ai");
  await capture(page,"fontes","/admin/research");
  await capture(page,"importacao","/companies/import",{prepare:async()=>{
    await page.getByLabel("Conteúdo CSV").fill("nome,setor,dominio\nAurora Contabilidade (exemplo),Contabilidade,empresa-0.example.invalid\nNova Empresa (exemplo),Contabilidade,nova.example.invalid");
    await page.getByRole("button",{name:"Ler colunas",exact:true}).click();
    await page.getByLabel("URL da origem dos dados").fill("https://example.invalid/manual");
    await page.getByLabel("Permissão de uso verificada").fill("Arquivo fictício criado para demonstração no manual");
    await page.getByLabel(/Tenho autorização para usar/).check();
    await page.getByRole("button",{name:"Gerar prévia",exact:true}).click();
    const title=page.getByRole("heading",{name:"3. Revisar 2 linhas",exact:true});await title.waitFor();
    await title.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-28));
  },anchor:"3. Revisar 2 linhas"});
  }
  const html=buildManual(screenshots);await writeFile(`${output}/Guia-de-Uso-PhishShield.html`,html);
  const printPage=await browser.newPage({viewport:{width:1123,height:794},deviceScaleFactor:1});await printPage.setContent(html,{waitUntil:"load"});await printPage.evaluate(()=>document.fonts.ready);
  const layout=await printPage.locator(".sheet").evaluateAll(elements=>elements.map((el,index)=>({page:index+1,overflow:el.scrollHeight>el.clientHeight+2,widthOverflow:el.scrollWidth>el.clientWidth+2})));
  if(layout.some(p=>p.overflow||p.widthOverflow))throw Error(`Manual layout overflow: ${JSON.stringify(layout.filter(p=>p.overflow||p.widthOverflow))}`);
  await printPage.pdf({path:`${output}/Guia-de-Uso-PhishShield.pdf`,format:"A4",landscape:true,printBackground:true,preferCSSPageSize:true,tagged:true,outline:true});
  for(const index of [0,2,5,11,15,20])if(index<layout.length)await printPage.locator(".sheet").nth(index).screenshot({path:`test-results/manual-pagina-${index+1}.png`});
  await writeFile(`${output}/verificacao.json`,JSON.stringify({generatedAt:new Date().toISOString(),pages:layout.length,screenshots:Object.keys(screenshots).length,layout,data:"Exclusivamente fictícios; banco separado removido ao concluir.",externalRequests:"Bloqueadas no navegador; nenhuma chamada real de IA ou envio."},null,2));
  console.log(`PDF generated: ${layout.length} pages; ${Object.keys(screenshots).length} screenshots.`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:"MANUAL_FAILED");process.exitCode=1;}).finally(async()=>{
  await browser?.close();if(server&&!server.killed){server.kill();await new Promise(r=>setTimeout(r,500));}
  await pool.end();if(created){await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);console.log("Temporary manual database removed.");}await admin.end();
});
