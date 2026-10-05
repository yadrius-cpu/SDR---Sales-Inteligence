import "dotenv/config";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";

// Separate empty database: no business records are copied or tested.
const statePath="test-results/security-lab.json";
const original=new URL(process.env.DATABASE_URL!);
if(!["127.0.0.1","localhost"].includes(original.hostname))throw Error("Local PostgreSQL required.");
const command=process.argv[2];
function run(args:string[],env:NodeJS.ProcessEnv){return new Promise<number>((resolve,reject)=>{
  const child=spawn(process.execPath,args,{env,stdio:"inherit",windowsHide:true});child.on("error",reject);child.on("exit",code=>resolve(code??1));
  process.once("SIGINT",()=>child.kill());process.once("SIGTERM",()=>child.kill());
});}
async function main(){
  if(command==="init"){
    try{await readFile(statePath);throw Error("Lab already exists; reuse or clean it up.");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
    const name=`security_lab_${randomBytes(8).toString("hex")}`,pool=new Pool({connectionString:original.toString()});
    try{await pool.query(`CREATE DATABASE "${name}"`);}finally{await pool.end();}
    await mkdir("test-results",{recursive:true});await writeFile(statePath,JSON.stringify({name,createdAt:new Date().toISOString()}));
    console.log("Isolated empty security database created.");
  }
  const state=JSON.parse(await readFile(statePath,"utf8")) as {name:string};
  if(!/^security_lab_[a-f0-9]{16}$/.test(state.name))throw Error("Invalid test database identifier.");
  const lab=new URL(original);lab.pathname=`/${state.name}`;
  const env={...process.env,DATABASE_URL:lab.toString(),APP_ORIGIN:"http://127.0.0.1:3001",SECURITY_TEST_ORIGIN:"http://127.0.0.1:3001",SECURITY_TEST_LOCAL:"true",AI_ENABLED:"false",CLAUDE_WRITING_ENABLED:"false",OPENAI_WRITING_ENABLED:"false"};
  if(command==="init"){
    if(await run(["--import","tsx","scripts/migrate.ts"],env))throw Error("Migration failed.");
    process.exitCode=await run(["--import","tsx","scripts/seed.ts"],{...env,NODE_ENV:"development"});
  }else if(command==="server"){
    process.exitCode=await run(["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3001"],{...env,NODE_ENV:"production"});
  }else if(command==="check"){
    process.exitCode=await run(["--import","tsx","scripts/security-assessment.ts"],env);
  }else if(command==="regress"){
    for(const name of ["smoke","research-smoke","outreach-smoke","conversation-smoke","writing-smoke","crm-smoke","analytics-smoke"]){
      console.log(`Regression: ${name}`);if(await run(["--import","tsx",`scripts/${name}.ts`],{...env,NODE_ENV:"development"})){process.exitCode=1;break;}
    }
  }else if(command==="cleanup"){
    const pool=new Pool({connectionString:original.toString()});
    try{await pool.query(`DROP DATABASE "${state.name}" WITH (FORCE)`);}finally{await pool.end();}
    await unlink(statePath);console.log("Only the isolated security database was removed.");
  }else if(command!=="init")throw Error("Use init, server, check, regress or cleanup.");
}
main().catch(e=>{console.error(e instanceof Error?e.message:"LAB_FAILED");process.exitCode=1;});
