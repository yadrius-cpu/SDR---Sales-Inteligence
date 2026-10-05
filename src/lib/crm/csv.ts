export const importFields=["displayName","legalName","domain","cnpj","sector","city","state","country","employeeEstimate"] as const;
export const importFieldLabels:Record<typeof importFields[number],string>={displayName:"Nome",legalName:"Razão social",domain:"Domínio",cnpj:"CNPJ",sector:"Setor",city:"Cidade",state:"UF",country:"País",employeeEstimate:"Funcionários (estimativa)"};
export function parseCsv(raw:string){
  if(raw.length>120000)throw new Error("CSV excede 120 mil caracteres.");
  const text=raw.replace(/^\uFEFF/,"");if(text.includes("\0"))throw new Error("CSV contém caractere inválido.");
  let quoted=false,commas=0,semicolons=0;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;}if(!quoted){if(c==='\n'||c==='\r')break;if(c===",")commas++;if(c===';')semicolons++;}}
  const delimiter=semicolons>commas?";":",";const rows:{line:number;cells:string[]}[]=[];let cells:string[]=[],field="",inQuotes=false,closed=false,line=1,startLine=1;
  const pushField=()=>{if(field.length>4000)throw new Error(`Campo muito longo na linha ${startLine}.`);cells.push(field);field="";closed=false;if(cells.length>40)throw new Error("Máximo de 40 colunas.");};
  const pushRow=()=>{pushField();if(cells.some(c=>c.trim()))rows.push({line:startLine,cells});cells=[];if(rows.length>201)throw new Error("Máximo de 200 empresas por importação.");};
  for(let i=0;i<text.length;i++){
    const c=text[i];if(inQuotes){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{inQuotes=false;closed=true;}}else{field+=c;if(c==='\n')line++;}continue;}
    if(c==='"'){if(field||closed)throw new Error(`Aspas inválidas na linha ${line}.`);inQuotes=true;continue;}
    if(c===delimiter){pushField();continue;}
    if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;pushRow();line++;startLine=line;continue;}
    if(closed)throw new Error(`Conteúdo após fechamento de aspas na linha ${line}.`);field+=c;
  }
  if(inQuotes)throw new Error("CSV com aspas não fechadas.");if(field||cells.length||closed)pushRow();
  if(rows.length<2)throw new Error("Inclua cabeçalho e ao menos uma empresa.");const headers=rows.shift()!.cells.map(s=>s.trim());
  if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new Error("Cabeçalhos devem ser únicos e preenchidos.");
  return {headers,rows,delimiter};
}
