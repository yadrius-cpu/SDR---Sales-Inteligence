import { importFields,parseCsv } from "./csv";
import { z } from "zod";
import { normalizeDomain } from "../security";
import { publicUrl,ResearchError } from "../research/contracts";

// Receita Federal: manual-dv-cnpj.pdf, ASCII - 48 and modulo 11.
export function normalizeCnpj(value:string){
  if(!value.trim())return null;
  if(!/^[A-Za-z0-9.\/\-\s]+$/.test(value))throw new Error("CNPJ inválido");
  const c=value.toUpperCase().replace(/[.\/\-\s]/g,"");
  if(!/^[A-Z0-9]{12}\d{2}$/.test(c)||/^(.)\1{13}$/.test(c))throw new Error("CNPJ inválido");
  const dv=(s:string)=>{let sum=0,weight=2;for(let i=s.length-1;i>=0;i--){sum+=(s.charCodeAt(i)-48)*weight;weight=weight===9?2:weight+1;}const r=sum%11;return r<2?"0":String(11-r);};
  const first=dv(c.slice(0,12));if(c.slice(12)!==first+dv(c.slice(0,12)+first))throw new Error("CNPJ inválido");return c;
}
const optionalText=(max:number)=>z.string().trim().max(max).default("");
export const companyInput=z.object({displayName:z.string().trim().min(2).max(160),legalName:optionalText(200),domain:optionalText(253),cnpj:optionalText(30),sector:z.string().trim().min(2).max(100),city:optionalText(100),state:z.string().trim().max(2).default("").refine(v=>!v||/^[a-zA-Z]{2}$/.test(v)),country:z.string().trim().min(2).max(80).default("Brasil"),employeeEstimate:z.union([z.literal(""),z.coerce.number().int().min(1).max(1000000)]).default(""),sourceUrl:z.union([z.literal(""),publicUrl]).default(""),permittedBasis:optionalText(1000),allowSharedDomain:z.boolean().default(false),ownerId:z.union([z.literal(""),z.uuid()]).default("")});
export type CompanyInput=z.infer<typeof companyInput>;
export function normalizeCompany(input:CompanyInput){
  let cnpj:string|null,domainNormalized:string|null;
  try{cnpj=normalizeCnpj(input.cnpj);}catch{throw new ResearchError("INVALID_CNPJ","CNPJ com formato ou dígitos verificadores inválidos.",400);}
  try{domainNormalized=normalizeDomain(input.domain);}catch{throw new ResearchError("INVALID_DOMAIN","Informe um domínio válido.",400);}
  return {displayName:input.displayName,legalName:input.legalName||null,domainNormalized,cnpj,sector:input.sector,city:input.city||null,state:input.state.toUpperCase()||null,country:input.country,employeeEstimate:input.employeeEstimate===""?null:input.employeeEstimate,sourceUrl:input.sourceUrl||null,permittedBasis:input.permittedBasis||null};
}
export const campaignInput=z.object({productId:z.uuid(),name:z.string().trim().min(2).max(160),sector:z.string().trim().min(2).max(100),employeeMin:z.coerce.number().int().min(1),employeeMax:z.coerce.number().int().max(1000000),geography:z.string().trim().min(2).max(160).default("Brasil"),targetRoles:z.string().trim().max(1000).default(""),inclusionCriteria:optionalText(2000),exclusionCriteria:optionalText(2000),status:z.enum(["draft","active","paused","completed"]).default("draft"),ownerId:z.union([z.literal(""),z.uuid()]).default("")}).refine(v=>v.employeeMax>=v.employeeMin,{message:"Faixa de funcionários inválida"});
export const campaignStatusLabels={draft:"Rascunho",active:"Ativa",paused:"Pausada",completed:"Concluída"};
export type ImportRow={line:number;data:ReturnType<typeof normalizeCompany>|null;errors:string[]};
export const importInput=z.object({csv:z.string().max(120000),mapping:z.partialRecord(z.enum(importFields),z.coerce.number().int().min(0).max(39)),campaignId:z.union([z.literal(""),z.uuid()]).default(""),ownerId:z.uuid(),sourceUrl:publicUrl,permittedBasis:z.string().trim().min(10).max(1000),authorization:z.literal("authorized_import"),requestKey:z.uuid()});
export function mappedRows(csv:string,mapping:Partial<Record<typeof importFields[number],number>>):ImportRow[]{
  const parsed=parseCsv(csv);if(mapping.displayName===undefined||mapping.sector===undefined)throw new Error("Mapeie Nome e Setor.");
  const indexes=Object.values(mapping);if(new Set(indexes).size!==indexes.length||indexes.some(i=>i!>=parsed.headers.length))throw new Error("Mapeamento repetido ou fora do cabeçalho.");
  return parsed.rows.map(row=>{try{if(row.cells.length!==parsed.headers.length)throw new Error("Quantidade de colunas difere do cabeçalho.");const values=Object.fromEntries(Object.entries(mapping).map(([key,index])=>[key,row.cells[index!]]));if(!values.country)delete values.country;return {line:row.line,data:normalizeCompany(companyInput.parse(values)),errors:[]};}catch(error){return {line:row.line,data:null,errors:[error instanceof z.ZodError?error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join("; "):error instanceof Error?error.message:"Linha inválida"]};}});
}
