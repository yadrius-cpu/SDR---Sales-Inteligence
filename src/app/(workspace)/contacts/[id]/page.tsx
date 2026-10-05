import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/security";
import { ContactFields } from "@/components/crm-fields";
import { ApiForm } from "@/components/forms";
export default async function EditContact({params}:{params:Promise<{id:string}>}){const user=await requireUser(),{id}=await params;if(!z.uuid().safeParse(id).success)notFound();const c=await db.query.contacts.findFirst({where:eq(contacts.id,id)});if(!c)notFound();return <><Link href={`/companies/${c.companyId}/outreach`}>← Contatos e oportunidades</Link><h1>Cadastro de {c.name}</h1><p>Editar exige nova revisão dos rascunhos ainda não enviados. O histórico de envios permanece preservado.</p>{c.doNotContactAt&&<p className="notice">Contato com opt-out. O bloqueio permanece; nome, perfil e e-mail não podem ser trocados neste fluxo.</p>}{canWrite(user.role)&&<section className="panel"><ApiForm key={c.version} endpoint={`contacts/${id}/edit`} label="Salvar contato"><input type="hidden" name="version" value={c.version}/><ContactFields value={c}/></ApiForm></section>}</>;}
