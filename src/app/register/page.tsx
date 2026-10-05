import Link from "next/link";
import { ApiForm } from "@/components/forms";

export default function Register() {
  return <main className="login">
    <div className="brand">◈ PHISHSHIELD <span>SALES INTELLIGENCE</span></div>
    <section className="panel">
      <p className="eyebrow">COMEÇAR</p>
      <h1>Crie o espaço da sua empresa.</h1>
      <p>O cadastro cria uma conta de administrador no Sales Intelligence. O PhishShield continua restrito a convites do administrador master.</p>
      <ApiForm endpoint="auth/register" label="Criar empresa" redirectTo="/onboarding">
        <label>Seu nome<input name="name" autoComplete="name" required maxLength={120}/></label>
        <label>E-mail profissional<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
        <label>Senha<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256}/></label>
        <label>Nome da empresa<input name="companyName" autoComplete="organization" required maxLength={160}/></label>
        <label>Domínio da empresa <small>(opcional)</small><input name="domain" placeholder="empresa.com.br" maxLength={253}/></label>
        <label>Segmento <small>(opcional)</small><input name="sector" placeholder="Ex.: contabilidade" maxLength={120}/></label>
      </ApiForm>
      <p><Link href="/login">Já possui uma conta? Entrar →</Link></p>
    </section>
  </main>;
}
