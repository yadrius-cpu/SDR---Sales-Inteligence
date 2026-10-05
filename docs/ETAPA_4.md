# Etapa 4 — Memória de conversa

Entrega v0.4. Registro de conversas, insights com trechos verificáveis, revisão, correção de hipóteses, próximos passos explicados e perda revisável. Integração OpenAI preparada e desativada; a chave será configurada localmente depois, conforme escolha do usuário.

## Usar agora

1. Abra uma oportunidade e clique em **Conversas e próximos passos**.
2. Escolha contato, tipo de registro, canal e data/hora. Cole a mensagem recebida ou registre uma nota do operador. Só marque mensagem recebida quando o texto for fala original do contato; resumos próprios não são citações literais.
3. Confira a prévia mascarada e registre a permissão/base adequada. O mascaramento local cobre padrões comuns de CPF, e-mail, números longos e segredos rotulados; não detecta todo dado sensível. Revise manualmente antes de salvar.
4. Na mensagem recebida, use **Analisar mensagem → Regras locais** ou cadastre um insight manual. As regras apenas apontam palavras-chave, podem confundir contexto/negação e nunca aprovam nada. Campo desconhecido não é preenchido por suposição.
5. Edite a interpretação, confira o trecho literal e classifique como declaração explícita ou inferência. Uma fala como “não temos problemas” não confirma dor, mesmo que a palavra “problemas” tenha produzido um candidato local.
6. Aprove/rejeite com justificativa. Insights explícitos aprovados, exceto indicação de opt-out, geram evidência do tipo **Declarado pelo contato**, com link para a atividade. Inferências permanecem interpretações, não fatos.
7. Para uma negação explícita, selecione a hipótese contradita e aprove a relação. A hipótese anterior fica rejeitada, a declaração entra na ficha e o resumo deverá ser recompilado. Nenhuma hipótese é alterada só porque o extrator sugeriu uma contradição.
8. Leia a próxima ação sugerida. Ela usa regras sobre insights revisados do contato principal, mostra justificativa e vínculos e sempre exige decisão humana. Não cria tarefa nem envia mensagem.
9. Registre evolução da oportunidade quando apropriado. O motivo é obrigatório, inclusive para perda, e pode ser corrigido em nova alteração explícita. Salvar conversa/extrair insights não muda o pipeline. Este fluxo não marca won nem reabre do_not_contact.

Um possível pedido de não contato suspende a recomendação de abordagem e orienta o operador a registrar o opt-out na ficha comercial. Texto externo não executa a operação; o bloqueio efetivo continua sendo confirmado pelo operador conforme etapa 3.

## Configurar OpenAI depois

Acrescente as variáveis da seção de IA de `.env.example` ao `.env` existente, sem sobrescrever banco e senha atuais:

```dotenv
AI_ENABLED=false
AI_POLICY_APPROVED=false
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_INPUT_USD_PER_MILLION=
OPENAI_OUTPUT_USD_PER_MILLION=
AI_DAILY_BUDGET_USD=1
AI_DAILY_REQUEST_LIMIT=20
```

Escolha um modelo da sua conta compatível com Responses API e Structured Outputs; preencha preços verificados de entrada/saída em USD por milhão de tokens. Não foi presumido um modelo, preço ou permissão de tratamento. Preencha a chave somente no servidor/local, nunca no chat ou frontend. Quando a política de envio ao provedor estiver aprovada, defina os dois flags como `true` e reinicie a aplicação. Owner pode conferir a configuração e o orçamento reservado em **Administração → Configuração de IA e limites**; a chave não é exibida.

Na mensagem, selecione OpenAI e marque a autorização explícita daquela análise. Somente o texto salvo e mascarado é enviado, sem nomes/cadastros anexados automaticamente. O conteúdo pode ainda conter dados pessoais não identificados pelo mascaramento, por isso a revisão é indispensável. O modelo extrai sugestões com citações; não controla ferramentas, aprovações, tarefas, estágio ou envio.

A integração usa `POST https://api.openai.com/v1/responses`, JSON Schema estrito, `store:false`, sem ferramentas, limite de 1.200 tokens de saída, prazo de 20 segundos e máximo de 100 KB de resposta. Zod e verificação de trecho literal são aplicados novamente no servidor. Resposta incompleta, recusa, falha ou trecho inventado não produz insights persistidos. O formato foi conferido na [documentação oficial de Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

`store:false` não significa retenção zero de todos os dados pelo provedor. Conferir os [controles de dados da OpenAI](https://developers.openai.com/api/docs/guides/your-data) e as condições da conta antes de conteúdo real.

Limites locais: orçamento diário em USD, número diário de solicitações e intervalo mínimo de 5 segundos. A aplicação reserva conservadoramente 40.000 tokens de entrada mais 1.200 de saída por tentativa, aos preços configurados. Reserva é debitada antes da chamada e não é devolvida em falhas/timeouts; é um teto conservador local, não a fatura do provedor. Reservas concorrentes que acabam usando replay podem superestimar o consumo. Uso retornado pelo provedor, modelo e versão do prompt ficam registrados sem o texto nos logs técnicos. Preços errados configurados produzem estimativas erradas; limites do projeto no provedor continuam recomendados.

Repetição da mesma versão/método reutiliza resultado; repetir uma falha exige selecionar explicitamente nova tentativa. Não há retries automáticos ou jobs disparados por conteúdo externo. Chamadas são síncronas e limitadas; worker/lotes ainda não fazem parte desta entrega.

**A integração OpenAI não foi validada com chave/modelo reais.** Todos os testes de provedor usaram respostas controladas, sem acesso externo. Local/manual funciona imediatamente. A IA desta etapa extrai insights; a sugestão de próximo passo continua sendo calculada por regras locais sobre esses insights. Resumos da etapa 2 continuam determinísticos; drafts da etapa 3 também oferecem redação Claude/GPT opcional desde v0.4.1.

## Correção e apagamento

Corrigir uma mensagem exige versão atual e remove seus insights e declarações derivadas, além dos resumos cujos snapshots as referenciam. Hipóteses anteriormente contraditas retornam a pendente se ainda estiverem na versão vinculada; não são aprovadas automaticamente.

Apagar conteúdo remove texto e base registrada, insights, declarações e resumos vinculados. Permanece um evento mínimo com autor, contato, canal, horário e indicação de apagamento, mais hashes/contagens operacionais sem texto. Isso não é exclusão integral de pessoa/empresa nem anonimização total. Texto copiado manualmente para campos sem vínculo e backups não é rastreado por essa operação; o fluxo administrativo completo de retenção/exportação/exclusão continua pendente.

## Banco, contratos e segurança

Migração `drizzle/0003_easy_stardust.sql`: conteúdo/autoria/versão/idempotência em activities; conversation_insights, extraction_runs, ai_daily_usage; vínculo de evidence com atividade e categoria customer_statement; motivo de perda e versão do estágio. Constraint exige atividade para declaração. Migração aplicada e repetida no PostgreSQL local.

| Método | Endpoint sob `/api/v1` | Uso |
|---|---|---|
| POST | `/activities` | Registrar conversa/nota com chave de idempotência |
| POST | `/activities/:id/edit` | Corrigir conteúdo e invalidar derivações |
| POST | `/activities/:id/erase` | Apagar conteúdo e derivações vinculadas |
| POST | `/activities/:id/insights` | Cadastrar interpretação com trecho literal |
| POST | `/activities/:id/extract-insights` | Extrair sugestões locais ou OpenAI, sempre pendentes |
| POST | `/conversation-insights/:id/edit` | Corrigir interpretação não aprovada |
| POST | `/conversation-insights/:id/review` | Aprovar/rejeitar e vincular negação a hipótese |
| GET | `/opportunities/:id/conversation` | Mensagens, insights, execuções e próxima ação |
| GET | `/opportunities/:id/next-action` | Sugestão explicada sem execução |
| POST | `/opportunities/:id/conversation-stage` | Alteração explícita de estágio/motivo |

Viewer só consulta. Mutações exigem sessão e origem, preservam auditoria sem copiar corpos e usam transações/versões para impedir aprovação de conteúdo alterado. Declarações derivadas não podem ser alteradas diretamente na API de evidências para contornar a revisão da conversa. Notas do operador não são elegíveis para extração de declarações do contato.

## Verificação e execução

```powershell
npm ci
npm run db:migrate
npm run dev
# Outro terminal:
npm test
npm run typecheck
npm run test:conversations
npm run test:conversation-browser
npm run build
```

21 testes unitários aprovados; smoke HTTP cobre idempotência, mascaramento, autorização, citações inexistentes, notas versus falas, negação corrigindo ficha, motivo de perda revisável, edição/apagamento e conteúdo hostil sem efeitos. Cenários OpenAI controlados verificam configuração ausente, orçamento insuficiente sem chamar provedor, erro de provedor, replay e resposta sem trecho válido. Testes de pesquisa/abordagem anteriores aprovados.

Edge headless validou formulário, extração local, edição/revisão, vínculo de negação, declaração na ficha e pipeline inalterado. Tela móvel sem overflow e sem erros de JavaScript. Capturas: `test-results/etapa-4-conversa-desktop.png` e `test-results/etapa-4-conversa-mobile.png`. As páginas do teste não fizeram requisições externas. Fixtures removidas ao concluir.

## Limites e próxima entrega

A redação opcional Claude/GPT foi acrescentada à revisão dos rascunhos em v0.4.1; consulte [Redação com IA](REDACAO_IA.md). A análise descrita nesta etapa permanece com OpenAI e tem configuração e orçamento separados.

Não há importação em lote de conversas, leitura automática do LinkedIn, treinamento de modelo, notificações externas ou integração automática ao produto PhishShield. O histórico de conversa ainda não é paginado; usar volumes pequenos no piloto. As pendências da etapa 1 foram entregues em v0.4.2; preparação para produção continua no README. Etapa 5 prevista: agregações por segmento/coorte, funil, amostras e experimentos.
