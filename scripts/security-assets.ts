import "dotenv/config";
import { readdir,readFile,writeFile,mkdir } from "node:fs/promises";
import path from "node:path";
async function files(dir:string):Promise<string[]>{const entries=await readdir(dir,{withFileTypes:true});const nested=await Promise.all(entries.map(e=>e.isDirectory()?files(path.join(dir,e.name)):Promise.resolve([path.join(dir,e.name)])));return nested.flat();}
async function main(){
  const assets=await files(".next/static");
  const secrets=Object.entries(process.env).filter(([key,value])=>/^(DATABASE_URL|POSTGRES_PASSWORD|SEED_PASSWORD|OPENAI_API_KEY|ANTHROPIC_API_KEY)$/.test(key)&&value&&value.length>=12);
  const findings:{asset:string;variable:string}[]=[];
  for(const asset of assets){const bytes=await readFile(asset);for(const [key,value] of secrets)if(bytes.includes(Buffer.from(value!)))findings.push({asset,variable:key});}
  const result={executedAt:new Date().toISOString(),assetsScanned:assets.length,secretVariablesChecked:secrets.map(([key])=>key),secretMatches:findings,sourceMaps:assets.filter(f=>f.endsWith(".map"))};
  await mkdir("test-results",{recursive:true});await writeFile("test-results/security-assets.json",JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(findings.length)process.exitCode=1;
}
main().catch(()=>{console.error("Asset scan failed.");process.exitCode=1;});
