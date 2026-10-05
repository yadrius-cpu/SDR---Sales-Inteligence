import { eq } from "drizzle-orm";
import { db } from "@/db";
import { writingDailyUsage } from "@/db/schema";
import { providers,writingConfig } from "@/lib/writing/provider";
export async function WritingAdmin(){
  const day=new Date().toISOString().slice(0,10);
  const entries=await Promise.all(providers.map(async provider=>({provider,config:writingConfig(provider),usage:await db.query.writingDailyUsage.findFirst({where:eq(writingDailyUsage.id,`${provider}:${day}`)})})));
  return <section className="panel"><h2>Redação de mensagens: Claude e GPT</h2><p>Claude é a primeira opção. O operador pode escolher GPT em cada rascunho. A análise de conversas continua com OpenAI. Não há troca automática de provedor.</p>{entries.map(({provider,config,usage})=><article key={provider}><h3>{provider==="claude"?"Claude (Anthropic)":"GPT (OpenAI)"}</h3><p>{config?`Habilitado · modelo ${config.model}`:"Desativado / configuração incompleta"}</p><p>Hoje (UTC): {usage?.requests??0} solicitações reservadas · US$ {((usage?.reservedMicrousd??0)/1000000).toFixed(4)} reservados.</p>{config&&<p>Limites de redação: {config.dailyLimit} solicitações / US$ {config.dailyBudget} por dia.</p>}</article>)}<p>Configure CLAUDE_WRITING_* e ANTHROPIC_API_KEY para Claude; OPENAI_WRITING_* e OPENAI_API_KEY para GPT. Cada provedor exige habilitação, política aprovada, modelo, preços e limites. As chaves não são exibidas.</p><p>As reservas são estimativas com os preços configurados e permanecem consumidas em falhas. Os limites de redação e análise são separados. Defina também os limites nas contas dos provedores.</p><p>Os pedidos de redação usam apenas o provedor escolhido, sem ferramentas. Contexto e exemplos não viram evidências aprovadas. Nenhuma mensagem é enviada ao contato.</p></section>;
}
