# PhishShield Sales Intelligence

Aplicação interna em português, independente do banco e do produto PhishShield.

## Estado atual — 30/09/2026

O MVP está pronto para demonstração e piloto controlado. A verificação local mais recente aprovou o typecheck, o build de produção e **39/39 testes unitários**. Isso valida o código e os fluxos exercitados, mas não significa que a infraestrutura de produção esteja configurada.

Antes de publicar para usuários reais, ainda é necessário configurar HTTPS/reverse proxy, domínio e `APP_ORIGIN`, contas reais, credencial de runtime do banco separada da credencial de migração, backups criptografados com teste de restauração, recuperação de conta e políticas de retenção/exportação/exclusão. O pentest de infraestrutura pública e o teste de carga também permanecem pendentes.

O Docker Desktop não estava disponível na última verificação desta máquina; portanto, o estado do PostgreSQL local não foi considerado evidência de ambiente operacional. Para iniciar o ambiente local, siga as instruções abaixo.

## Entrega atual

**Segurança — 27/09/2026:** avaliação em laboratório isolado, correções de leitura HTTP/cota de IA/validação, CSP com nonce, cabeçalhos e limite global de login. Relatório, evidências e riscos ainda abertos em [avaliação de segurança](docs/PENTEST_2026-09-27.md). Isso não substitui a preparação da infraestrutura para produção.

**Atualização — etapa 5:** insights por campanha, setor e coorte de criação, funil de marcos registrados, dores/objeções/pedidos revisados, motivos de perda e experimentos A/B com protocolo fixo, sorteio, janela de observação e intervalos de incerteza. Abra **Insights e experimentos** no menu. Migração aditiva e instruções em [etapa 5](docs/ETAPA_5.md). Verificação: `npm run test:analytics`.

**Atualização v0.4.2:** etapa 1 entregue: importação CSV com mapeamento/prévia/decisões por linha, CNPJ numérico e alfanumérico, busca/filtros/paginação, edição de cadastros, vínculo empresa/campanha, responsáveis e pipeline completo com histórico. Abra **Empresas → Importar empresas por CSV** ou **Pipeline**. Instruções em [etapa 1](docs/ETAPA_1.md).

**Atualização v0.4.1:** redação com Claude como primeira opção e GPT como alternativa, com escolha de tom, contexto revisado e exemplo de estilo. Abra a revisão de um rascunho → **Redigir com IA**. Ambos ficam desativados até configuração local; consulte [Redação com IA](docs/REDACAO_IA.md). A análise de conversas continua com OpenAI.

**Atualização v0.4:** memória de conversa, insights com trechos, revisão, correção de hipóteses e próximos passos explicados. Abra uma oportunidade → **Conversas e próximos passos**. Integração OpenAI preparada, desativada até configurar chave/modelo/preços e política em `.env`; instruções em [etapa 4](docs/ETAPA_4.md). As etapas de [abordagem](docs/ETAPA_3.md) e [pesquisa](docs/ETAPA_2.md) continuam disponíveis.

Fundação executável (estágio 0) e fluxos dos estágios 1–5 implementados para piloto local. Next.js 16.3.6, React, TypeScript, PostgreSQL 17 e Drizzle 0.45.3, com versões resolvidas em `package-lock.json`. Login por senha com scrypt, sessão opaca persistida como hash, expiração de 8 horas, cookies HttpOnly/SameSite, verificação de origem em mutações, limite persistente de tentativas por conta e autorização no servidor.

Telas: login, visão geral com contagens reais, empresas, campanhas, pesquisa/revisão, contatos, oportunidades, abordagens, tarefas e administração com catálogo versionado. Cadastros e mutações comerciais têm auditoria transacional. Domínio repetido retorna conflito e exige confirmação explícita de empresa distinta; não há fusão automática. Owner acessa admin, operator cadastra e revisa, viewer consulta. O banco contém apenas demonstração fictícia inicialmente.

## Executar no Windows / PowerShell

Pré-requisitos: Node.js 22.14 ou superior compatível e Docker Desktop em execução.

```powershell
npm ci
Copy-Item .env.example .env
# Edite .env e defina SEED_PASSWORD com ao menos 12 caracteres.
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

Abra http://127.0.0.1:3000. Contas: `owner@demo.invalid`, `operator@demo.invalid`, `viewer@demo.invalid`; senha configurada em `SEED_PASSWORD`. O seed não altera senhas de usuários existentes. Na instalação criada nesta sessão, `.env` já contém uma senha aleatória local; consulte esse arquivo sem compartilhá-lo. Não sobrescreva `.env` ao retomar esta instalação.

Variáveis: `DATABASE_URL` conecta ao banco comercial; `POSTGRES_PASSWORD` configura o container; `APP_ORIGIN` deve coincidir exatamente com a origem usada no navegador; `SEED_PASSWORD` cria exclusivamente as contas fictícias. `.env` está ignorado no Git. Nenhuma chave de LLM é necessária.

O PostgreSQL fica restrito a `127.0.0.1:5440`, evitando conflito com a porta padrão. `docker compose stop` para o banco preservando os dados. O servidor usa apenas loopback. Build: `npm run build`. Para produção, configurar HTTPS/reverse proxy, origem, contas reais e operação antes de usar `npm start`; cookies de produção exigem HTTPS.

## Verificar

```powershell
npm run typecheck
npm test
npm run build
# Com npm run dev aberto em outro terminal:
npx tsx scripts/smoke.ts
npm run test:research
npm run test:outreach
# Requer Edge instalado; usa perfil temporário e apenas a aplicação local:
npm run test:browser
npm run test:conversations
npm run test:conversation-browser
npm run test:writing
npm run test:crm
npm run test:crm-browser
```

O smoke usa as contas fictícias, cria dados próprios, verifica as permissões no endpoint e remove os cadastros que criou. Não executar contra produção. Para alterar o schema: `npm run db:generate`, revisar o SQL em `drizzle/` e `npm run db:migrate`. As migrações são versionadas; não use schema push em produção.

Resultados v0.4.2: **39 testes unitários**, integração de CRM com importação de 20 linhas e paginação acima de 50 cadastros, regressões de fundação/abordagem/conversa/redação, TypeScript e build aprovados. Edge verificou prévia/decisões/importação, busca, edição, pipeline, histórico e layout móvel. Capturas e limites em [etapa 1](docs/ETAPA_1.md).

Resultados v0.4.1: 25 testes unitários aprovados; TypeScript e build aprovados; migração de redação aplicada. Integração com PostgreSQL validou Claude/GPT simulados, orçamento, replay, concorrência, preservação do texto em falhas e descarte após opt-out. Regressões HTTP de abordagem/conversa aprovadas. Edge validou seleção de provedor, contexto obrigatório para respostas, bloqueio sem autorização/origem, layout móvel e fluxo manual anterior. Capturas: `test-results/redacao-ia-desktop.png` e `test-results/redacao-ia-mobile.png`. Nenhuma chamada real aos provedores de IA; qualidade de redação e compatibilidade com o modelo escolhido ainda exigem avaliação após configuração local.

Resultados v0.4: TypeScript e build aprovados; 21 testes unitários aprovados; migrações reproduzíveis; smoke HTTP de fundação, pesquisa, abordagem e conversa aprovados com PostgreSQL real. Edge validou cópia real sem envio, confirmação manual, opt-out e o fluxo de registro/extração/revisão de conversa com hipótese corrigida, também em tela móvel. Capturas em `test-results/`. Testes de concorrência confirmam ausência de duplicação de envio/tarefa. Wikidata e OpenAI foram testados com respostas controladas, sem consulta externa real; orçamento insuficiente e erros do provedor foram exercitados. Restauração de backup ainda não foi testada.

Auditoria npm: nenhuma vulnerabilidade em dependências de produção; 4 avisos moderados na cadeia de desenvolvimento `drizzle-kit → @esbuild-kit → esbuild`, relacionados ao servidor de desenvolvimento do esbuild. Esse servidor não é utilizado aqui. Atualização da cadeia pendente; não aplicado o downgrade incompatível sugerido por `npm audit fix --force`.

## API disponível

`/api/v1/auth/login`, `/auth/logout`, `/me`, `GET/POST /companies`, `GET/POST /campaigns`, `GET /products`, `GET /admin/users`, `GET /admin/audit`, todos sob `/api/v1`. Consultas de empresas/campanhas têm `page` e 50 itens por página. Escrita requer JSON, sessão e header Origin compatível. Erros têm formato `{error:{code,message}}`. Empresas têm busca, filtros e paginação visual de 50 resultados; detalhes e rotas adicionais em [etapa 1](docs/ETAPA_1.md).

Contratos adicionais de pesquisa estão em [etapa 2](docs/ETAPA_2.md); contatos, oportunidades, drafts, opt-out, tarefas e catálogo em [etapa 3](docs/ETAPA_3.md); conversas, insights, correção de hipóteses e configuração OpenAI em [etapa 4](docs/ETAPA_4.md); redação Claude/GPT em [Redação com IA](docs/REDACAO_IA.md).

## Limites e próximos passos

Estágio 1 entregue conforme [etapa 1](docs/ETAPA_1.md). CNPJ tem validação local de formato/DV, sem consulta cadastral. Importações são limitadas a 200 linhas por lote; sem fusão automática. Exclusão/exportação integral e retenção permanecem no escopo administrativo de preparação para produção.

Estágios 2–5 disponíveis conforme seus documentos. Etapa 6 pendente: integrações opcionais. Agregações e experimentos da etapa 5 estão implementados para piloto local, com limites descritos em [etapa 5](docs/ETAPA_5.md). Não há envio automático de mensagens. LinkedIn é utilizado manualmente; Wikidata permanece desabilitado. Adaptadores OpenAI/Claude foram implementados e testados com respostas controladas, mas estão desativados e não foram validados com chaves reais.

Antes de dados pessoais reais: implementar exportação/exclusão, retenção, gestão de usuários, recuperação de senha, limpeza de sessões antigas, políticas de privacidade, backup criptografado e restauração; separar a credencial de runtime do superusuário do banco. Login agora tem limite global de 60 requisições/minuto, além de 10 tentativas/conta em 15 minutos, e limpeza de tentativas com mais de 24 horas. Esses limites não substituem proteção na borda e ainda permitem bloqueio temporário de uma conta por terceiro. Auditoria guarda IDs e metadados mínimos, sem senhas ou corpos das conversas. Campanhas não devem operar em escala nesta versão.

Veja [validação do blueprint](docs/VALIDACAO_BLUEPRINT.md) e [matriz de capacidades](docs/CAPACIDADES_PHISHSHIELD.md).
