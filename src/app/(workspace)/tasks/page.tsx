import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts,tasks,users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/security";
import { ApiForm } from "@/components/forms";
export default async function TasksPage(){const user=await requireUser();const rows=await db.select({t:tasks,name:contacts.name,assignee:users.name}).from(tasks).innerJoin(contacts,eq(tasks.contactId,contacts.id)).innerJoin(users,eq(tasks.assigneeId,users.id)).orderBy(tasks.dueAt).limit(100);return <><p className="eyebrow">PRÓXIMAS AÇÕES</p><h1>Tarefas</h1><p>Lembretes internos. Nenhuma tarefa dispara mensagem. Até 100 registros ordenados pela data.</p>{rows.map(({t,name,assignee})=><section className="panel" key={t.id}><span className="badge">{t.status==="cancelled"?"Cancelada":t.status==="done"?"Concluída":t.dueAt<new Date()?"Vencida":"Pendente"}</span><h2>{name}</h2><p>{t.description}</p><p>Data: {t.dueAt.toLocaleDateString("pt-BR",{timeZone:"UTC"})} UTC · Responsável: {assignee}</p><Link href={`/opportunities/${t.opportunityId}`}>Abrir oportunidade →</Link>{canWrite(user.role)&&t.status==="pending"&&<ApiForm endpoint={`tasks/${t.id}/status`} label="Atualizar tarefa"><label>Resultado<select name="status"><option value="done">Concluída (não confirma envio)</option><option value="cancelled">Cancelada</option></select></label></ApiForm>}</section>)}{!rows.length&&<section className="panel"><p>Nenhuma tarefa registrada. Crie uma na oportunidade ou ao confirmar envio manual.</p></section>}</>;}
