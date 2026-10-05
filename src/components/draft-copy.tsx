"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function DraftCopy({id,version}:{id:string;version:number}){
  const [pending,setPending]=useState(false),[message,setMessage]=useState("");const router=useRouter();
  return <div><button disabled={pending} onClick={async()=>{setPending(true);setMessage("");try{
    const request=async(action:string)=>fetch(`/api/v1/drafts/${id}/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version})});
    const response=await request("copy-content"),json=await response.json();if(!response.ok)throw new Error(json.error.message);
    if(!navigator.clipboard?.writeText)throw new Error("Área de transferência indisponível. Você pode selecionar o texto aprovado manualmente.");
    await navigator.clipboard.writeText(json.data.message);
    const recorded=await request("copied");if(!recorded.ok){setMessage("Texto copiado, mas o registro não foi salvo. Recarregue e verifique se o contato continua autorizado antes de usar o texto.");return;}
    setMessage("Texto copiado. Nenhuma mensagem foi enviada. Confirme o envio somente depois de realizá-lo manualmente.");router.refresh();
  }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível copiar. Nenhum envio foi registrado.");}finally{setPending(false);}}}>{pending?"Copiando…":"Copiar texto aprovado"}</button><p role="status">{message}</p></div>;
}
