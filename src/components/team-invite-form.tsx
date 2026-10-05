"use client";

import { useState } from "react";

export function TeamInviteForm() {
  const [inviteUrl,setInviteUrl] = useState("");
  const [message,setMessage] = useState("");
  const [pending,setPending] = useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(""); setInviteUrl("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/team/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(form))});
      const json = await response.json();
      if (!response.ok) { setMessage(json.error?.message ?? "Não foi possível criar o convite."); return; }
      setInviteUrl(json.data.inviteUrl); setMessage("Convite criado. Copie o link e envie ao funcionário.");
      event.currentTarget.reset();
    } catch { setMessage("Falha de conexão. Tente novamente."); } finally { setPending(false); }
  }
  return <form onSubmit={submit}><div className="fields"><label>E-mail do funcionário<input name="email" type="email" required maxLength={254}/></label><label>Função<select name="role" defaultValue="sales_user"><option value="sales_user">Vendedor</option><option value="sales_manager">Gestor comercial</option><option value="company_viewer">Somente leitura</option><option value="company_admin">Administrador</option></select></label></div><button disabled={pending}>{pending ? "Criando…" : "Criar convite"}</button>{message&&<p role="status">{message}</p>}{inviteUrl&&<label>Link do convite<input readOnly value={inviteUrl} onFocus={event=>event.currentTarget.select()}/></label>}</form>;
}
