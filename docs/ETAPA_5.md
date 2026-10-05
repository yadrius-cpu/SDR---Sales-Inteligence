# Etapa 5 — Insights e experimentos

Implementada para piloto local. Acesse **Insights e experimentos** no menu, ou `/analytics`. Não precisa configurar IA nem serviços externos.

## Análises disponíveis

- Filtros por campanha, setor e data de criação da oportunidade. Datas são dias UTC completos, incluindo a data final. Sem datas, considera toda a base.
- Funil de marcos observados: contato confirmado, resposta recebida, reunião e venda ganha. Cada oportunidade conta uma vez por marco; marcos não são inferidos pela posição no pipeline. Pular uma etapa não cria eventos retroativos.
- Distribuição atual por estágio: os totais somam o número de oportunidades filtradas. Resultados por campanha mostram ganhas e perdidas sobre a base de cada campanha.
- Dores, objeções e pedidos de produto por setor: apenas insights aprovados, vinculados à versão vigente de atividades não apagadas. Declarações explícitas e interpretações ficam separadas. Rótulos são agrupados por texto normalizado (caixa e espaços), sem agrupamento semântico por IA.
- Proporções dos temas entre oportunidades com resposta registrada e entre todas as oportunidades do setor. Repetir uma fala não aumenta a contagem de um mesmo tema na oportunidade. Temas diferentes podem se sobrepor; ausência de relato não significa ausência de dor.
- Motivos de perda das oportunidades atualmente perdidas. Motivos livres equivalentes podem permanecer separados.

A unidade é **oportunidade**, não pessoa ou empresa. Uma empresa pode ter várias oportunidades. O período seleciona a coorte de criação, e o histórico é observado até o momento da consulta; não é um relatório do estado passado em uma data. Campanha, setor e estágio usam o cadastro atual. Zero no denominador é apresentado como “sem base”, nunca como 0% de conversão.

Resposta recebida significa mensagem de entrada registrada ou evento de mudança explícita para `replied`; não implica qualificação comercial. Reunião e venda exigem evento explícito para seu estágio. Mensagens apagadas deixam de contar; eventos de estágio preservados continuam sendo registros válidos.

## Experimentos A/B

1. Em **Abrir experimentos A/B**, registre nome, hipótese, campanha, abordagens A/B, métrica primária, janela de 1–90 dias, mínimo de 30 ou mais oportunidades por grupo e último dia de inscrições.
2. O protocolo v1 é fixo após salvar. Uma mudança exige outro experimento; não existe edição silenciosa após resultados conhecidos.
3. Abra o experimento e escolha uma oportunidade da campanha. A inscrição verifica ausência de contato anterior, opt-out e histórico incompatível. Cada empresa participa com uma oportunidade por experimento; cada oportunidade só participa de um experimento. A lista é uma pré-seleção, e a elegibilidade completa é conferida ao salvar.
4. O servidor sorteia A/B com probabilidade 50/50. O sorteio é persistente e auditado, inclusive sob repetição ou concorrência. Execute manualmente a abordagem atribuída; inscrição não cria nem envia mensagens.
5. A janela começa na inscrição. O denominador inclui somente participantes cuja janela terminou, inclusive os que não responderam. Participantes com janela incompleta aparecem como pendentes. O sucesso exige evento ocorrido a partir da inscrição e antes do fim exclusivo da janela, registrado após a inscrição. Correções posteriores podem alterar os resultados.
6. Compare contagens, denominadores e intervalos de Wilson de 95%. Amostra abaixo do mínimo em qualquer grupo exibe “Amostra insuficiente”. Mesmo acima do mínimo, o sistema apresenta uma comparação descritiva, sem declarar vencedor ou causalidade. O mínimo operacional não substitui um cálculo de poder estatístico.

Não há aplicação automática da variante ao rascunho, teste de significância, ajuste de múltiplas comparações, estratificação ou treinamento de modelo. A seleção manual e a execução da abordagem exigem disciplina do operador. O bloqueio de participação em outros experimentos é por oportunidade; empresas com oportunidades distintas em outros experimentos precisam de controle operacional para evitar interferência.

## Banco e API

Migração aditiva `drizzle/0006_public_prodigy.sql`: `experiments` e `experiment_members`, chaves estrangeiras, unicidade, limites e enumerações por constraints. Não altera os registros comerciais existentes.

| Método | Endpoint sob `/api/v1` | Uso |
|---|---|---|
| GET | `/analytics?campaignId=&sector=&from=&to=` | Agregações da coorte |
| GET/POST | `/experiments` | Listar ou registrar protocolo |
| GET | `/experiments/:id` | Protocolo, participantes e comparação |
| POST | `/experiments/:id/enroll` | Verificar elegibilidade e sortear |

Viewer consulta; operator e owner registram protocolos e participantes. Mutações exigem sessão e origem válida. Criação usa `requestKey` por autor; reuso com conteúdo diferente retorna conflito. Inscrição é idempotente por oportunidade. Auditoria registra identificadores, versão e grupo, sem copiar hipótese ou abordagem. Leituras usam transação com snapshot consistente. Os relatórios são calculados em consulta, adequados ao piloto; não há materialização, paginação de agregados ou teste de carga para grande volume.

## Verificação

```powershell
npm run db:migrate
npm run dev
# Em outro terminal:
npm test
npm run typecheck
npm run test:analytics
npm run build
```

Validação em 27/09/2026: 35 testes unitários aprovados, TypeScript e build aprovados. Teste integrado com PostgreSQL verifica totais, filtros por período/setor/campanha, repetição de respostas, aprovação/versão de insights, motivos de perda, denominadores de experimentos, concorrência/idempotência, permissões e origem. Edge headless verifica filtros, criação de protocolo e inscrição pela interface, consulta viewer e layouts desktop/móvel, sem chamadas externas. Dados fictícios do teste são removidos ao terminar.

Regressões HTTP de fundação, CRM e conversas também aprovadas (`test:smoke`, `test:crm`, `test:conversations`).

Capturas em `test-results/etapa-5-insights-desktop.png`, `etapa-5-insights-mobile.png`, `etapa-5-experimento-desktop.png` e `etapa-5-experimento-mobile.png`.

Etapa 6 e preparação para produção permanecem conforme README.
