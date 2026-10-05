"use client";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
type Provider="claude"|"openai";
export function WritingForm({id,version,providers,defaultProvider}:{id:string;version:number;providers:{provider:Provider;enabled:boolean;model:string|null}[];defaultProvider:Provider}){
  const [provider,setProvider]=useState(defaultProvider),[purpose,setPurpose]=useState("initial"),[pending,setPending]=useState(false),[error,setError]=useState("");
  const request=useRef<{key:string;body:string}|null>(null),router=useRouter();
  const selected=providers.find(p=>p.provider===provider)!;
  return <form onSubmit={async event=>{
    event.preventDefault();setPending(true);setError("");
    const body=JSON.stringify({...Object.fromEntries(new FormData(event.currentTarget)),version});
    if(!request.current||request.current.body!==body)request.current={body,key:crypto.randomUUID()};
    try{
      const response=await fetch(`/api/v1/drafts/${id}/generate-text`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...JSON.parse(body),requestKey:request.current.key})});
      const json=await response.json();
      if(!response.ok){setError(json.error?.message??"Não foi possível gerar o texto.");if(json.data?.status==="failed")request.current=null;return;}
      if(response.status===202){setError("Esta geração está em andamento. Aguarde e recarregue a página para ver o resultado.");return;}
      request.current=null;router.refresh();
    }catch{setError("Conexão interrompida. Tente novamente com os mesmos dados para consultar a solicitação sem duplicá-la.");}finally{setPending(false);}
  }}>
    <div className="fields"><label>Provedor de redação<select name="provider" value={provider} disabled={pending} onChange={e=>setProvider(e.target.value as Provider)}><option value="claude">Claude (Anthropic)</option><option value="openai">GPT (OpenAI)</option></select></label><label>Tipo de mensagem<select name="purpose" value={purpose} disabled={pending} onChange={e=>setPurpose(e.target.value)}><option value="initial">Primeira abordagem</option><option value="reply">Resposta</option><option value="follow_up">Follow-up</option></select></label><label>Tom<select name="tone" disabled={pending}><option value="natural">Natural e cordial</option><option value="direct">Direto e breve</option><option value="consultative">Consultivo</option></select></label></div>
    <label>Contexto revisado da conversa{purpose!=="initial"?" (obrigatório)":" (opcional)"}<textarea name="context" maxLength={2000} minLength={purpose!=="initial"?10:undefined} required={purpose!=="initial"} rows={3} disabled={pending} placeholder="Resuma apenas o que realmente foi dito e o objetivo desta mensagem. Remova dados que não devem sair do sistema."/></label>
    <label>Exemplo do seu estilo (opcional)<textarea name="styleExample" maxLength={1200} rows={3} disabled={pending} placeholder="Cole uma mensagem sua sem nomes ou dados pessoais. Ela servirá apenas como referência de tom."/></label>
    <p>Serão enviados ao provedor escolhido: nome do contato e da empresa, rascunho atual, fatos públicos selecionados, catálogo, contexto e exemplo acima. O mascaramento é parcial; confira o conteúdo antes de autorizar.</p>
    <label className="checkbox"><input type="checkbox" name="authorization" value="reviewed_and_authorized" required disabled={pending}/>Revisei os dados e o contexto e autorizo seu envio ao provedor selecionado. Conferirei fatos e promessas antes de aprovar a mensagem.</label>
    <p>{selected.enabled?`Modelo configurado: ${selected.model}`:"Este provedor está desativado ou sem configuração completa. Configure-o em Administração / IA."}</p>
    {error&&<p role="alert" className="error">{error}</p>}
    <button disabled={pending||!selected.enabled}>{pending?"Gerando…":"Gerar texto para revisão"}</button>
  </form>;
}
