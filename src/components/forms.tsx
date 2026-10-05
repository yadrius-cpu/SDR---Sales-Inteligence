"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ApiForm({endpoint,children,label,redirectTo}:{endpoint:string;children:React.ReactNode;label:string;redirectTo?:string}) {
  const [error,setError]=useState("");
  const [pending,setPending]=useState(false);
  const [success,setSuccess]=useState(false);
  const router=useRouter();
  return <form onSubmit={async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    setPending(true); setError(""); setSuccess(false);
    try {
      const body:Record<string,unknown>=Object.fromEntries(new FormData(form));
      for (const input of Array.from(form.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'))) {
        if (input.name && input.value) body[input.name]=new Date(input.value).toISOString();
      }
      if(body.allowSharedDomain) body.allowSharedDomain=true;
      const response=await fetch(`/api/v1/${endpoint}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const json=await response.json();
      if(!response.ok){setError(json.error.message);return;}
      setSuccess(true); if(redirectTo)router.push(redirectTo); router.refresh();
    } catch { setError("Falha de conexão. Tente novamente."); }
    finally { setPending(false); }
  }}>{children}{error&&<p className="error" role="alert">{error}</p>}<p role="status">{success?"Salvo com sucesso.":""}</p><button disabled={pending}>{pending?"Aguarde…":label}</button></form>;
}

export function Logout(){return <ApiForm endpoint="auth/logout" label="Sair" redirectTo="/login"><></></ApiForm>;}
