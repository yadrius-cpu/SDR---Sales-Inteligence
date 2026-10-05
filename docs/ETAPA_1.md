# Etapa 1 — CRM e campanhas

Entregue em v0.4.2, completando as pendências do CRM após os fluxos das etapas 2–4. O critério de aceite foi exercitado: importação de 20 linhas fictícias com duplicatas, correção de conflitos, atribuição de responsáveis, campanha de contabilidades e movimentação auditada de oportunidade.

## Usar

- **Empresas:** busca por nome, razão social, domínio e CNPJ; filtros de setor, UF, responsável e campanha; paginação de 50 resultados. O cadastro inclui CNPJ opcional, razão social, cidade/UF, estimativa de funcionários, fonte e permissão de uso.
- **Ficha da empresa → Cadastro, responsável e campanhas:** corrigir dados e responsável; vincular campanha sem criar oportunidade nem exigir contato. Criar oportunidade também garante o vínculo. Alterações de nome/CNPJ/domínio removem aprovação e cópia dos rascunhos ativos não enviados, para revisão humana do texto.
- **Contatos e abordagens → Editar cadastro:** corrigir dados profissionais com verificação de duplicatas e versão. O opt-out é preservado. Nome/perfil/e-mail de contato bloqueado não podem ser trocados nesse fluxo. Correções exigem revisão dos rascunhos ativos não enviados.
- **Campanhas:** cadastrar/editar público, região, faixa de funcionários, papéis alvo, inclusão/exclusão, situação e responsável. O produto de campanha existente não pode ser trocado. Situação e critérios são informações de planejamento; não executam campanhas ou qualificam empresas automaticamente.
- **Oportunidade → Gestão da oportunidade:** reatribuir responsável com motivo; mudar estágio com confirmação. Tarefas já existentes mantêm seus responsáveis.
- **Pipeline:** quadro com todos os estágios, filtros e contagens dos resultados. Mostra até 50 oportunidades por página, agrupadas por estágio. Movimentação por formulário confirmado, sem arrastar automaticamente. Todos os estágios são visíveis; opt-out se registra na ficha do contato.
- **Histórico completo:** eventos paginados, ator, data UTC, estágio anterior/novo, responsável anterior/novo e motivo. Conversas permanecem acessíveis por link próprio.

## Importar CSV

1. Abra **Empresas → Importar empresas por CSV**. Escolha arquivo UTF-8 ou cole conteúdo; clique **Ler colunas**.
2. Mapeie Nome e Setor (obrigatórios) e os demais campos que existirem. Cabeçalhos livres são aceitos; cada coluna pode ser mapeada uma vez.
3. Escolha responsável, campanha opcional, URL de origem e permissão de uso; confirme autorização.
4. Gere a prévia. Ela é persistida, mas ainda não cria empresas. O link de retomada e as dez prévias recentes permitem continuar depois. Só o criador e o owner acessam cada prévia; viewer não importa.
5. Revise cada linha: criar, vincular empresa existente, ignorar ou confirmar empresa distinta com nome/domínio compartilhado. CNPJ igual nunca pode criar outra empresa, mesmo com confirmação de domínio compartilhado. CNPJs diferentes não podem ser vinculados como a mesma empresa. Nome/domínio são sinais de possível duplicata, não identidade comprovada.
6. Para dados inválidos, volte ao CSV, corrija e gere outra prévia, ou escolha ignorar conscientemente. Duplicatas internas podem ser ignoradas; não há fusão automática. Vincular não sobrescreve dados ou responsável do cadastro existente, apenas registra o uso e o vínculo de campanha.
7. Confirme a importação revisada. A operação verifica novamente os conflitos atuais e grava tudo em uma transação. Um conflito bloqueia a operação inteira, sem importar parcialmente. Retome a prévia pelo link para atualizar correspondências e revisar as decisões.

Limites do piloto: até 200 empresas/120 mil caracteres, 40 colunas, 4.000 caracteres por campo; cabeçalhos únicos e preenchidos. Vírgula/ponto e vírgula, BOM UTF-8, CRLF, aspas escapadas e quebras dentro de aspas são aceitos. Conteúdo nunca é executado como fórmula, HTML ou instrução. Não há exportação CSV nesta entrega. Prévias armazenam somente dados mapeados, erros por linha e origem, sem o arquivo bruto; permanecem no banco até implementar a política de retenção.

Exemplo fictício:

```csv
nome,setor,dominio,cnpj,cidade,uf,funcionarios
Contabilidade de exemplo,Contabilidade,contabilidade-exemplo.invalid,,São Paulo,SP,12
```

## CNPJ

Aceita 12 caracteres alfanuméricos e dois dígitos numéricos; mantém zeros à esquerda e normaliza letras para maiúsculas. O cálculo usa ASCII menos 48, pesos cíclicos de 2 a 9 e módulo 11, conforme o [manual técnico da Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf). O mesmo cálculo atende os CNPJs numéricos existentes.

Validação de formato/DV **não confirma registro, razão social nem situação cadastral na Receita**. Não há consulta externa automática nem enriquecimento por CNPJ. Estimativas de funcionários e demais dados de cadastro são informados pelo operador e não se transformam em evidências aprovadas.

## Pipeline e proteção dos fluxos anteriores

`contacted` exige confirmação explícita de contato manual e não confirma envio de um rascunho específico. `won` exige confirmação humana e referência do fechamento, com data registrada no servidor. Perda exige motivo revisável. Encerrar como ganha/perdida/fora do perfil cancela tarefas pendentes e descarta rascunhos não enviados; envios históricos são preservados.

Opt-out continua pelo fluxo existente, aplicado ao contato e às oportunidades abertas relacionadas. Oportunidades ganhas preservam o fechamento mesmo se houver opt-out posterior; o contato continua bloqueado. O pipeline e o fluxo de conversa não reabrem opt-out nem vendas ganhas. Uma perda/fora do perfil pode ser revista com motivo e confirmação; tarefas canceladas e rascunhos descartados não são reativados automaticamente.

Mudanças de estágio e responsável usam `stageVersion`; cadastros de empresa/contato/campanha têm versão própria. Requisições desatualizadas retornam conflito. Auditoria não copia corpos de conversa ou CSV bruto. Revisões de cadastro guardam versão e responsáveis, sem histórico integral de cada valor pessoal anterior.

## API e migração

Todas as rotas estão sob `/api/v1`, exigem sessão e, para escrita, `Origin` correto e perfil owner/operator. A API usa POST para mutações, seguindo a convenção já adotada pelo projeto.

| Rota | Uso |
|---|---|
| `GET/POST /companies` | Lista filtrada/paginada ou cadastro com CNPJ |
| `POST /companies/:id/edit` | Corrigir cadastro e responsável, com versão |
| `POST /companies/:id/campaigns` | Vínculo idempotente com campanha |
| `POST /companies/import` | Criar prévia com CSV, mapeamento, origem e UUID requestKey |
| `GET /companies/imports/:id` | Retomar prévia e recalcular correspondências |
| `POST /companies/imports/:id/commit` | Confirmar decisões; replay idempotente por prévia |
| `POST /campaigns` e `/campaigns/:id/edit` | Criar/editar campanha |
| `POST /contacts/:id/edit` | Corrigir contato, preservando opt-out |
| `GET /crm/assignees` | Responsáveis ativos, sem credenciais |
| `GET /pipeline` | Quadro filtrado/paginado e contagens |
| `POST /opportunities/:id/stage` | Mudar estágio com motivo/versão/confirmação |
| `POST /opportunities/:id/owner` | Reatribuir com motivo/versão |

Filtros: `q`, `sector`, `ownerId`, `campaignId`, `page`; empresas aceitam `state`, pipeline aceita `stage`. A prévia guarda o hash da entrada; reutilizar requestKey com outro conteúdo retorna conflito. Repetir commit com as mesmas decisões retorna o resultado sem duplicar empresas/vínculos.

Migração `0005_sturdy_bill_hollister.sql`: campos opcionais/versionamento, CNPJ único, vínculos campanha/empresa, prévias persistidas e informações de fechamento. Vínculos das oportunidades anteriores são preenchidos na migração. Nenhum cadastro existente é removido.

## Verificação

```powershell
npm run db:migrate
npm run dev
# Outro terminal:
npm test
npm run test:crm
npm run test:crm-browser
npm run typecheck
npm run build
```

39 testes unitários aprovados no conjunto atual. A cobertura específica desta etapa inclui integração HTTP/PostgreSQL com 20 linhas com duplicatas/erro, prévia sem criar empresa, replay, conflito concorrente com rollback, correção de decisões, CNPJ, paginação com mais de 50 empresas, responsáveis, venda explicitamente confirmada e opt-out. Regressões de fundação, abordagem, conversa e redação aprovadas. Edge validou mapeamento/prévia/commit, busca, edição, movimentação, histórico e layout móvel sem overflow ou erros JavaScript. Nenhuma chamada externa foi feita pela página.

Capturas: `test-results/etapa-1-previa-desktop.png`, `etapa-1-pipeline-desktop.png`, `etapa-1-pipeline-mobile.png`. Dados dos testes foram removidos. Produção, exclusão/exportação por pessoa/empresa, retenção de prévias, gestão de contas, backup/restauração e análises da etapa 5 continuam fora desta entrega. Não há botão de exclusão destrutiva de cadastro nem fusão de empresas nesta etapa.
