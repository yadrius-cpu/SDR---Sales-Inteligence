# SDR Sales Intelligence

Plataforma web de CRM e inteligência comercial para equipes de vendas B2B. O sistema centraliza empresas, contatos, campanhas, oportunidades, tarefas, pesquisas, conversas e abordagens comerciais em um único ambiente.

A aplicação ajuda a equipe a descobrir e organizar empresas-alvo, registrar evidências, identificar oportunidades, acompanhar o pipeline, analisar conversas e criar mensagens personalizadas com apoio de IA. Toda abordagem passa por revisão humana antes de ser utilizada.

O sistema foi desenvolvido para funcionar inicialmente em ambiente local e piloto controlado, com PostgreSQL, Next.js, React, TypeScript e Drizzle ORM.

## A jornada

| Etapa | Onde | O que acontece |
|---|---|---|
| 1. Usuários e acesso | Login e administração | Cada usuário acessa o sistema com sua própria conta, sessão protegida e papel definido: proprietário, operador ou visualizador. |
| 2. Produtos e campanhas | Catálogo e campanhas | O administrador cadastra produtos, diferenciais, claims permitidos, claims proibidos, setores, regiões e cargos-alvo. |
| 3. Empresas | CRM | A equipe cadastra ou importa empresas por CSV, identifica duplicidades, define responsáveis e associa empresas a campanhas. |
| 4. Pesquisa comercial | Pesquisa | São registrados fatos públicos, fontes, URLs, evidências e hipóteses sobre cada empresa. Todo conteúdo precisa ser revisado antes de ser tratado como evidência aprovada. |
| 5. Contatos e oportunidades | CRM e pipeline | A equipe registra contatos, cargos, canais, oportunidades, etapas do funil, próximos passos e responsáveis. |
| 6. Abordagens | Outreach | O sistema cria rascunhos de mensagens com contexto comercial, produto, empresa e objetivo da abordagem. O texto precisa ser revisado e aprovado antes do uso. |
| 7. Conversas | Conversas e insights | Conversas podem ser registradas, corrigidas e analisadas. A IA pode sugerir dores, objeções, pedidos, intenções e próximos passos, sempre aguardando revisão humana. |
| 8. Analytics | Insights e experimentos | Os resultados podem ser analisados por campanha, setor, coorte e etapa do funil, além de permitir experimentos A/B com protocolo definido. |

## Arquitetura

```text
┌──────────────────────────────────────────────────────────────┐
│ Usuário                                                       │
│ Login, CRM, pesquisa, pipeline, conversas e abordagens       │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼───────────────────────────────┐
│ Next.js 16 + React + TypeScript                              │
│ Interface, autenticação, rotas da aplicação e API            │
└──────────────────────────────┬───────────────────────────────┘
                               │ Drizzle ORM
┌──────────────────────────────▼───────────────────────────────┐
│ PostgreSQL 17                                                │
│ Usuários, empresas, contatos, campanhas, evidências,         │
│ oportunidades, tarefas, conversas, auditoria e analytics     │
└──────────────────────────────────────────────────────────────┘
```

Integrações opcionais:
- API Anthropic para geração de textos comerciais
- API OpenAI para análise de conversas
- Wikidata para pesquisa pública controlada

## Funcionalidades principais

- Cadastro e gestão de empresas, contatos e responsáveis.
- Importação de empresas por CSV com prévia e tratamento de duplicidades.
- Campanhas com critérios de inclusão e exclusão.
- Pipeline comercial com histórico de alterações.
- Cadastro de produtos e catálogo versionado.
- Pesquisa com fontes, evidências e fundamento de permissão.
- Registro e revisão de hipóteses comerciais.
- Criação e revisão de rascunhos de abordagem.
- Geração de textos com Claude ou OpenAI.
- Registro de conversas e atividades.
- Extração de insights de conversas.
- Registro de opt-out e bloqueio de contato.
- Tarefas e próximos passos.
- Auditoria transacional das ações.
- Analytics por campanha, setor e coorte.
- Experimentos A/B comerciais.
- Controle de acesso por usuário, organização e produto.

## O que o sistema não faz atualmente

- Não envia mensagens automaticamente pelo LinkedIn.
- Não automatiza navegador ou sessão do LinkedIn.
- Não possui integração de envio pelo WhatsApp.
- Não dispara campanhas em massa.
- Não substitui a revisão humana das mensagens.
- Não está pronto para uso com dados pessoais reais sem configuração adicional de produção.

A execução de contatos ainda é manual: o sistema prepara, organiza e revisa as informações e mensagens, mas o operador decide quando e por qual canal realizar o contato.

## Segurança e governança

| Camada | Proteção |
|---|---|
| Senhas | Armazenadas com derivação baseada em scrypt. |
| Sessões | Token opaco armazenado como hash, com expiração e cookie HttpOnly. |
| Autorização | Permissões verificadas no servidor conforme o papel do usuário. |
| Requisições | Validação de origem, limite de tamanho e validação de JSON. |
| Login | Limites por conta e limite global contra tentativas abusivas. |
| Dados de IA | Uso condicionado à configuração, política aprovada e autorização explícita. |
| Evidências | Fatos, hipóteses e declarações de clientes possuem tipos e status de revisão diferentes. |
| Conversas | Conteúdo pode ser corrigido, apagado e reprocessado sem perder o histórico de auditoria. |
| Abordagens | Alterações em contatos ou contexto invalidam rascunhos aprovados. |
| Opt-out | Contatos que pedem para não ser abordados ficam bloqueados para novos fluxos. |
| Auditoria | Ações comerciais e administrativas são registradas com usuário, entidade e metadados. |
| Banco | Migrações versionadas e separadas do código da aplicação. |

## Riscos e limitações atuais

Antes de utilizar o sistema com dados reais, ainda é necessário configurar:

- HTTPS e reverse proxy.
- Domínio e \`APP_ORIGIN\`.
- Contas reais de usuários.
- Credencial de runtime separada da credencial de migração do banco.
- Backups criptografados e teste de restauração.
- Política de retenção, exportação e exclusão.
- Recuperação de senha e limpeza de sessões antigas.
- Política de privacidade e base legal para dados pessoais.
- Pentest da infraestrutura pública.
- Teste de carga.

As integrações com Claude, OpenAI e Wikidata estão preparadas, mas devem ser configuradas e avaliadas antes do uso em produção.

## Executar localmente

Pré-requisitos:

- Node.js 22.14 ou superior.
- Docker Desktop.
- npm.

No PowerShell:

```powershell
npm ci
Copy-Item .env.example .env
```

Edite o arquivo \`.env\` e defina uma senha para \`SEED_PASSWORD\`. Depois execute:

```powershell
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

Abra \`http://127.0.0.1:3000\`.

As contas de demonstração são:

```text
owner@demo.invalid
operator@demo.invalid
viewer@demo.invalid
```

A senha é a definida na variável \`SEED_PASSWORD\`. O banco PostgreSQL local utiliza a porta \`5440\`.

## Configuração de IA

As integrações de IA ficam desativadas por padrão.

Para geração de mensagens, configure:

```text
ANTHROPIC_API_KEY
CLAUDE_WRITING_MODEL
OPENAI_API_KEY
OPENAI_WRITING_MODEL
```

Para análise de conversas:

```text
OPENAI_API_KEY
OPENAI_MODEL
```

A aplicação exige configuração válida, autorização explícita e revisão humana antes de considerar qualquer resultado de IA como aprovado.

## Verificação

```powershell
npm run typecheck
npm test
npm run build
```

Testes específicos:

```powershell
npm run test:research
npm run test:outreach
npm run test:conversations
npm run test:writing
npm run test:crm
npm run test:analytics
```

Os testes de navegador exigem o Microsoft Edge instalado:

```powershell
npm run test:browser
npm run test:conversation-browser
npm run test:crm-browser
```

## Banco de dados

Para gerar uma nova migração:

```powershell
npm run db:generate
```

Para aplicar as migrações:

```powershell
npm run db:migrate
```

As migrações ficam versionadas na pasta \`drizzle/\`. Não utilize atualização automática do schema em produção sem revisar a migração gerada.

## Status atual

O projeto está em estágio de MVP para demonstração e piloto controlado.

Já estão implementados:

- CRM de empresas e contatos.
- Campanhas e pipeline.
- Importação CSV.
- Pesquisa e evidências.
- Abordagens comerciais.
- Conversas e insights.
- Redação assistida por IA.
- Analytics e experimentos.
- Auditoria e controle de permissões.
- Testes automatizados e migrações versionadas.

A próxima etapa principal é preparar a infraestrutura de produção e, posteriormente, avaliar integrações controladas com canais externos de prospecção.

## Documentação

- [Blueprint do projeto](PhishShield_Sales_Intelligence_Blueprint.md)
- [Arquitetura, produtos e acessos](docs/ARQUITETURA_PRODUTOS_E_ACESSOS.md)
- [Capacidades do produto](docs/CAPACIDADES_PHISHSHIELD.md)
- [Redação com IA](docs/REDACAO_IA.md)
- [Validação do blueprint](docs/VALIDACAO_BLUEPRINT.md)
