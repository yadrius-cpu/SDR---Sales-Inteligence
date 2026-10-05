import { ApiForm } from "@/components/forms";

export default async function Invite({searchParams}:{searchParams:Promise<{token?:string}>}) {
  const token = (await searchParams).token ?? "";
  return <main className="login"><div className="brand">◈ PHISHSHIELD <span>SALES INTELLIGENCE</span></div><section className="panel"><p className="eyebrow">CONVITE DE EQUIPE</p><h1>Entre na equipe da empresa.</h1><p>Defina seus dados de acesso para usar o Sales Intelligence.</p><ApiForm endpoint="team/accept" label="Aceitar convite" redirectTo="/"><input type="hidden" name="token" value={token}/><label>Seu nome<input name="name" autoComplete="name" required maxLength={120}/></label><label>Senha<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required/></label></ApiForm></section></main>;
}
