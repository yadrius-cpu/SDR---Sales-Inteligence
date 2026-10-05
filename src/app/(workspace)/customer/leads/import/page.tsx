import Link from "next/link";
import { CustomerLeadImport } from "@/components/customer-lead-import";
import { requireUser } from "@/lib/auth";

export default async function CustomerLeadImportPage() {
  const user = await requireUser();
  if (user.customerRole === "company_viewer") return <><h1>Importação restrita</h1><p>Seu perfil permite somente leitura.</p><Link href="/customer/leads">Voltar aos leads</Link></>;
  return <><Link href="/customer/leads">← Leads e oportunidades</Link><p className="eyebrow">CRM DA EMPRESA</p><h1>Importar leads</h1><p className="intro">Revise os dados antes de gravar. Os duplicados são identificados por domínio ou nome dentro da sua empresa.</p><CustomerLeadImport/></>;
}
