import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ApiForm } from "@/components/forms";
import { db } from "@/db";
import { customerLeads, customerTasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export default async function CustomerTasks() {
  const user = await requireUser();
  if (!user.customerOrganizationId) return <><h1>Tarefas</h1><p>Esta conta ainda não está vinculada a uma empresa cliente.</p><Link href="/">Voltar</Link></>;
  const [rows,leads] = await Promise.all([
    db.select({task:customerTasks,companyName:customerLeads.companyName}).from(customerTasks).innerJoin(customerLeads,eq(customerTasks.leadId,customerLeads.id)).where(eq(customerTasks.organizationId,user.customerOrganizationId)).orderBy(asc(customerTasks.dueAt)),
    db.select({id:customerLeads.id,name:customerLeads.companyName}).from(customerLeads).where(eq(customerLeads.organizationId,user.customerOrganizationId)),
  ]);
  const canWrite = user.customerRole !== "company_viewer";
  return <><p className="eyebrow">PRÓXIMAS AÇÕES</p><h1>Tarefas de follow-up</h1><p className="intro">Organize a próxima ação de cada lead. Criar uma tarefa não envia mensagens automaticamente.</p><section className="panel"><h2>Tarefas</h2>{rows.map(({task,companyName})=><article className="panel" key={task.id}><span className="badge">{task.status==="pending"?"Pendente":task.status==="done"?"Concluída":"Cancelada"}</span><h3>{companyName}</h3><p>{task.description}</p><small>{task.dueAt.toLocaleString("pt-BR",{timeZone:"UTC"})} UTC</small>{canWrite&&task.status==="pending"&&<ApiForm endpoint={"customer/tasks/"+task.id+"/status"} label="Atualizar" redirectTo="/customer/tasks"><select name="status" defaultValue="done"><option value="done">Concluir</option><option value="cancelled">Cancelar</option></select></ApiForm>}</article>)}{!rows.length&&<p>Nenhuma tarefa criada.</p>}</section>{canWrite&&<section className="panel"><h2>Nova tarefa</h2><ApiForm endpoint="customer/tasks" label="Criar tarefa" redirectTo="/customer/tasks"><label>Lead<select name="leadId" required defaultValue="">{<option value="" disabled>Selecione um lead</option>}{leads.map(lead=><option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></label><label>Data e hora<input name="dueAt" type="datetime-local" required/></label><label>Descrição<textarea name="description" rows={3} minLength={3} maxLength={500} required/></label></ApiForm></section>}</>;
}
