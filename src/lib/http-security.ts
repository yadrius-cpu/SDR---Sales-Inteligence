export class BodyError extends Error {
  constructor(public code:string, message:string, public status:number){super(message);}
}
export function validateJsonStructure(value:unknown){
  const pending:{value:unknown;depth:number}[]=[{value,depth:0}];
  while(pending.length){const item=pending.pop()!;
    if(item.depth>40)throw new BodyError("INVALID_JSON","JSON excede a profundidade permitida.",400);
    if(typeof item.value==="string"&&item.value.includes("\0"))throw new BodyError("INVALID_JSON","Caractere nulo não permitido.",400);
    if(item.value&&typeof item.value==="object")for(const [key,child] of Object.entries(item.value)){
      if(key.includes("\0"))throw new BodyError("INVALID_JSON","Caractere nulo não permitido.",400);
      pending.push({value:child,depth:item.depth+1});
    }
  }
}
// Count bytes while reading, not after allocating an unbounded request body.
export async function boundedJson(request:Request, limit:number, timeoutMs=10000):Promise<unknown> {
  if(Number(request.headers.get("content-length")||0)>limit)throw new BodyError("BODY_TOO_LARGE","Conteúdo excede o limite.",413);
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new BodyError("UNSUPPORTED_MEDIA_TYPE","Envie JSON com Content-Type application/json.",415);
  if(request.headers.has("content-encoding")&&request.headers.get("content-encoding")!=="identity")throw new BodyError("UNSUPPORTED_ENCODING","Compressão de requisição não aceita.",415);
  const reader=request.body?.getReader();if(!reader)throw new BodyError("INVALID_JSON","JSON inválido.",400);
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new BodyError("REQUEST_TIMEOUT","Tempo de leitura excedido.",408));void reader.cancel().catch(()=>{});},timeoutMs);});
  const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){const {done,value}=await Promise.race([reader.read(),timeout]);if(done)break;size+=value.byteLength;
      if(size>limit){void reader.cancel().catch(()=>{});throw new BodyError("BODY_TOO_LARGE","Conteúdo excede o limite.",413);}chunks.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{const value:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));validateJsonStructure(value);return value;}catch{throw new BodyError("INVALID_JSON","JSON inválido.",400);}
  }finally{if(timer)clearTimeout(timer);reader.releaseLock();}
}
