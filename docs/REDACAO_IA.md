# Redação com Claude e GPT

Claude é a primeira opção para redação; GPT é selecionável em cada rascunho. A análise de conversas da etapa 4 continua com OpenAI. As regras de aprovação, opt-out, pipeline e confirmação manual são executadas pela aplicação.

## Usar

1. Crie um rascunho na oportunidade e abra sua revisão.
2. Em **Redigir com IA**, escolha Claude ou GPT, tipo de mensagem e tom.
3. Para resposta ou follow-up, informe um resumo revisado da conversa. Opcionalmente forneça um exemplo do seu estilo, sem dados pessoais.
4. Confira os dados e autorize seu envio ao provedor selecionado. Clique em **Gerar texto para revisão**.
5. Confira a mensagem gerada, edite se necessário e aprove antes de copiar. O envio ao contato continua manual.

A nova mensagem substitui o texto atual, incrementa sua versão e remove aprovação e registro de cópia. Provedor/modelo ficam visíveis. Contexto é informação fornecida pelo operador, não evidência automaticamente aprovada; exemplos servem somente como referência de estilo. As conversas e insights não são importados automaticamente para o redator. O resumo manual precisa ser conferido contra a conversa original.

## Configuração local

Não sobrescreva seu `.env`. Copie apenas as variáveis novas de `.env.example` e preencha localmente. Nenhuma chave deve ser colocada no navegador, no código ou no chat.

Claude:

```dotenv
WRITING_DEFAULT_PROVIDER=claude
ANTHROPIC_API_KEY=<chave local>
CLAUDE_WRITING_ENABLED=true
CLAUDE_WRITING_POLICY_APPROVED=true
CLAUDE_WRITING_MODEL=<modelo disponível na sua conta com Messages API>
CLAUDE_WRITING_INPUT_USD_PER_MILLION=<preço de entrada do modelo>
CLAUDE_WRITING_OUTPUT_USD_PER_MILLION=<preço de saída do modelo>
CLAUDE_WRITING_DAILY_BUDGET_USD=1
CLAUDE_WRITING_DAILY_REQUEST_LIMIT=20
```

Para a alternativa GPT, configure `OPENAI_WRITING_*` com os mesmos sufixos e `OPENAI_API_KEY`. Escolha um modelo compatível com Responses e geração de texto. O modelo de redação é independente de `OPENAI_MODEL`, usado na análise. Não há um modelo fixo ou preço presumido no código; confira disponibilidade e preços na sua conta antes de ativar.

Reinicie o servidor. Em **Administração → Configuração de IA e limites**, confira o estado de cada provedor. Abrir a tela não faz chamadas externas. Cada provedor exige configuração completa e política aprovada separadamente. Os templates locais continuam disponíveis sem chave.

## Dados, custos e falhas

- Envia nome do contato/empresa, persona/canal, rascunho, catálogo da versão utilizada, fatos públicos selecionados, contexto e exemplo. Não envia e-mail/perfil do cadastro nem todo o histórico automaticamente. O mascaramento cobre apenas padrões comuns e não garante anonimização.
- Claude usa [Messages API](https://platform.claude.com/docs/en/api/messages/create); GPT usa [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses), com `store:false`. Nenhum conector recebe ferramentas. `store:false` não garante retenção zero pelo provedor; confira as condições das contas antes de autorizar dados reais.
- Limites separados por provedor, dia UTC e finalidade: redação GPT e análise OpenAI têm orçamentos independentes. Cada chamada reserva custo estimado usando bytes de entrada mais margem e até 1.800 tokens de saída, com os preços configurados. Reservas permanecem consumidas em falhas. Os valores não garantem o total real da fatura; configure limites também nas contas. Intervalo mínimo de cinco segundos por provedor.
- Timeout de 30 segundos; host fixo, sem redirecionamento, sem retry automático e sem fallback entre provedores. Falhas e saídas truncadas/recusadas preservam o rascunho. Uma tentativa explícita nova pode gerar nova cobrança.
- Repetir `requestKey` e conteúdo retorna o estado da mesma execução; conteúdo diferente com a mesma chave retorna conflito. Requisição concorrente em curso retorna 202. Se o processo morrer durante a chamada, o registro pode permanecer `running`; confira antes de iniciar nova tentativa. Não há worker de recuperação nesta versão.
- Antes e depois da chamada são verificados versão, envio confirmado, catálogo, fatos vigentes, etapa e opt-out. Alterações durante a chamada descartam a saída. IA não envia mensagens, aprova textos ou movimenta oportunidades.
- Histórico de execução guarda provedor, modelo, versão do prompt, hash, estado e uso estimado; não guarda chaves, erros brutos, contexto ou exemplos. A mensagem resultante fica no rascunho; não há histórico integral de cada versão do texto.
- Instruções reduzem afirmações inventadas, mas não garantem correção semântica. A revisão humana permanece obrigatória, inclusive para dados extraídos do contexto manual.

## API e testes

`POST /api/v1/drafts/:id/generate-text` exige sessão, origem correta e perfil owner/operator. Entrada: `version`, UUID `requestKey`, `provider` (`claude`/`openai`), `purpose` (`initial`/`reply`/`follow_up`), `tone` (`natural`/`direct`/`consultative`), `context`, `styleExample`, `authorization: "reviewed_and_authorized"`. Resposta: `data.runId`, `data.status`; consulte o rascunho atualizado após sucesso. Contexto é obrigatório para resposta/follow-up.

Migração aditiva: `0004_tranquil_secret_warriors.sql`. Aplicar com `npm run db:migrate`.

```powershell
npm test
npm run test:writing
npm run typecheck
npm run build
```

Testes usam respostas simuladas, sem chave real: contratos dos dois provedores, recusas/truncamento, limites, autorização, replay, concorrência, remoção de aprovação, falhas e opt-out. A qualidade comercial ainda depende de avaliação com os modelos reais escolhidos.

Validação desta entrega: 25 testes unitários, integração de redação com PostgreSQL, regressões HTTP de abordagem/conversa, TypeScript e build aprovados. `npm run test:browser` também verifica o seletor e o contexto obrigatório, layout móvel, rejeição HTTP sem autorização/origem e mantém a regressão de aprovação/cópia/envio manual. Essa verificação de navegador não chama os provedores; gerações bem-sucedidas foram exercitadas por integração com respostas controladas.

## Comparação inicial sugerida

Separe 12 casos fictícios ou autorizados: quatro primeiras abordagens, quatro respostas e quatro follow-ups. Use a mesma base, contexto, tom e exemplo nos dois provedores. Guarde cada saída antes de gerar a seguinte: o rascunho é substituído, e o texto atual faz parte da entrada. Para comparação justa, restaure o mesmo texto-base antes de cada chamada.

Apresente as saídas como A/B sem revelar o provedor e dê notas de 1 a 5 para naturalidade, precisão, adequação ao contexto e esforço de edição (5 = pouco esforço). Registre também custo, tempo e erros. Mensagens com promessas inventadas não devem ser aprovadas mesmo com boa nota de estilo. Escolha o padrão pelo resultado; a ferramenta não declara um vencedor antes desse teste.
