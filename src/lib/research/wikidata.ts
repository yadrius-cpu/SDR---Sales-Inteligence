import { request } from "node:https";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import { z } from "zod";
import { ResearchError } from "./contracts";
export const entityIdSchema=z.string().regex(/^Q[1-9][0-9]{0,11}$/);
// Fail closed: only public IPv4. DNS resolution is pinned to this TLS request.
export function isPublicIpv4(address:string){
  if(isIP(address)!==4)return false;
  const [a,b,c]=address.split(".").map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export function entityUrl(id:string){return `https://www.wikidata.org/wiki/Special:EntityData/${entityIdSchema.parse(id)}.json`;}
export function downloadEntity(id:string,contactEmail:string):Promise<string>{
  const url=entityUrl(id);
  const email=z.email().parse(contactEmail);
  return new Promise((resolve,reject)=>{
    const fail=()=>new ResearchError("SOURCE_UNAVAILABLE","A fonte não respondeu com dados válidos. Nenhuma evidência foi criada.",502);
    const req=request(url,{
      family:4,
      headers:{"User-Agent":`PhishShieldSalesIntelligence/0.2 (mailto:${email})`,Accept:"application/json"},
      lookup:(_hostname,_options,callback)=>lookup("www.wikidata.org",{family:4},(error,address,family)=>{
        if(error||!isPublicIpv4(address))return callback(new Error("Blocked DNS address"),"",4);
        callback(null,address,family);
      }),
    },res=>{
      // Redirects are deliberately not followed; no operator-controlled URL is fetched.
      if(res.statusCode!==200||!res.headers["content-type"]?.includes("application/json")){res.destroy();reject(fail());return;}
      let size=0;const chunks:Buffer[]=[];
      res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>2_000_000){req.destroy(fail());return;}chunks.push(chunk);});
      res.on("error",()=>reject(fail()));res.on("end",()=>resolve(Buffer.concat(chunks).toString("utf8")));
    });
    const timer=setTimeout(()=>req.destroy(fail()),10_000);
    req.on("close",()=>clearTimeout(timer));req.on("error",()=>reject(fail()));req.end();
  });
}
const localized=z.record(z.string(),z.object({value:z.string().max(800)}));
export function parseEntity(raw:string,id:string){
  const parsed=z.object({entities:z.record(z.string(),z.object({id:z.string(),type:z.literal("item"),labels:localized,descriptions:localized.optional(),lastrevid:z.number().int().positive(),claims:z.object({P31:z.array(z.object({mainsnak:z.object({datavalue:z.object({value:z.object({id:z.string()})}).optional()})})).optional()}).optional()}))}).parse(JSON.parse(raw));
  const entity=parsed.entities[id];
  if(!entity||entity.id!==id)throw new ResearchError("INVALID_SOURCE","A fonte retornou outra entidade.",502);
  if(entity.claims?.P31?.some(c=>c.mainsnak.datavalue?.value.id==="Q5"))throw new ResearchError("PERSON_NOT_SUPPORTED","Este conector é destinado a registros de empresas, não pessoas.",502);
  const label=entity.labels["pt-br"]?.value??entity.labels.pt?.value??entity.labels.en?.value;
  const description=entity.descriptions?.["pt-br"]?.value??entity.descriptions?.pt?.value??entity.descriptions?.en?.value;
  if(!label)throw new ResearchError("EMPTY_SOURCE","A fonte não possui nome nos idiomas consultados.",502);
  return {claim:`O registro ${id} do Wikidata apresenta o nome “${label}”${description?` e a descrição “${description}”`:""}. Associação à empresa exige revisão humana.`,excerpt:[label,description].filter(Boolean).join(" — "),url:`${entityUrl(id)}?revision=${entity.lastrevid}`};
}
