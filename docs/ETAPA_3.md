# Etapa 3 — Abordagem assistida

Implementada com LinkedIn manual. Não existe integração de envio, leitura de mensagens, scraping ou navegação automatizada no LinkedIn. O teste de navegador automatiza somente a aplicação local com dados fictícios.

Atualização v0.4.1: além do template inicial, a revisão oferece **Redigir com IA**, com Claude ou GPT, tom e exemplo de estilo. Integrações desativadas até configuração; consulte [Redação com IA](REDACAO_IA.md). Os passos abaixo continuam válidos para o fluxo local sem IA.

## Fluxo de uso

1. Em **Empresas**, abra a ficha e clique em **Contatos e abordagens**.
2. Cadastre nome, cargo, papel provável, fonte, permissão verificada e finalidade profissional. Perfil e e-mail de trabalho são opcionais. Cargo é informação cadastrada, não prova de poder de decisão.
3. Crie oportunidade vinculada à campanha e a um contato principal. Empresa pode ter vários contatos e oportunidades; rascunhos podem escolher outros contatos da mesma empresa.
4. Abra a oportunidade. Escolha persona (sócio/direção/administrativo ou responsável técnico), opcionalmente um fato público aprovado e vigente e uma alegação aprovada do produto.
5. Gere o rascunho. Sem evidência específica, aparece como **genérico**. Sem capacidade validada no catálogo, o template faz discovery sem prometer funcionalidades. Nenhum LLM é utilizado.
6. Confira destinatário, canal, justificativa, evidências e versão do catálogo. Edite se necessário. A edição remove aprovação e registro de cópia e incrementa a versão.
7. Marque a declaração de revisão e aprove. Só então use **Copiar texto aprovado**. A aplicação valida novamente autorização e vigência antes de entregar o texto. Registro de cópia ocorre após sucesso da área de transferência; copiar não altera o estágio para contacted.
8. Envie pessoalmente no LinkedIn, se decidir fazê-lo. Depois marque a confirmação explícita e clique em **Confirmar que enviei manualmente**. A aplicação apenas registra o fato informado pelo operador; não verifica o LinkedIn nem envia por você.
9. Opcionalmente crie um lembrete de revisão da resposta em 1–60 dias (padrão: 7). Também pode cadastrar tarefa manual na oportunidade, com contato, responsável e data. Concluir tarefa não confirma envio.

**Abordagens** reúne rascunhos para revisar/copiar; **Tarefas** permite concluir/cancelar lembretes. As listas visuais mostram até 100 registros. Datas dos lembretes são apresentadas em UTC.

## Opt-out

Na ficha comercial do contato, abra **Registrar pedido de não contato**, marque a confirmação e salve. A operação é transacional: registra bloqueio, descarta rascunhos não enviados e cancela tarefas pendentes do contato. Oportunidades em que ele é o contato principal passam a do_not_contact; seus outros rascunhos e tarefas também são interrompidos. O histórico de envios confirmados permanece intacto.

Geração, aprovação, cópia, confirmação de envio e novas tarefas revalidam o bloqueio no servidor. Não há reativação automática nem botão de reconsentimento nesta entrega. Texto já copiado fora da aplicação não pode ser revogado; a ficha orienta a não usá-lo após opt-out.

Duplicatas são recusadas por nome normalizado dentro da empresa, por perfil normalizado ou e-mail profissional globalmente. Isso evita recriar a mesma identidade com outro vínculo para contornar opt-out. Homônimos/transferências exigirão fluxo de correção; não há fusão automática. Identidades sem perfil/e-mail não são reconhecidas entre empresas apenas por inferência de nome.

## Catálogo e revisão humana

Owner pode usar **Administração → Validar alegações do catálogo** para registrar capacidades reais e proibições (uma por linha, máximo 10 de até 500 caracteres), com confirmação explícita da validação. Nenhuma capacidade real foi adicionada nesta entrega. Alterações incrementam a versão e bloqueiam rascunhos antigos ainda não enviados; snapshots de mensagens já confirmadas são preservados.

Templates inserem somente a alegação selecionada do catálogo e, opcionalmente, um fato público revisado da mesma empresa. Não transformam hipótese em dor confirmada. Texto livre editado pelo operador não tem verificação semântica automática: quem aprova deve conferir alegações e evidências. A declaração obrigatória de revisão documenta essa responsabilidade; não certifica a veracidade de qualquer texto inserido.

Alterar, rejeitar ou expirar uma evidência utilizada bloqueia aprovação/cópia/confirmação do rascunho. Deve-se gerar outro com base vigente. Catálogo, contato, oportunidade e evidências são conferidos dentro de transação, com bloqueio por empresa para serializar confirmação/opt-out/edição. Confirmar duas vezes com a mesma chave por rascunho retorna o registro original, sem duplicar atividade ou tarefa. Histórico enviado não pode ser editado/descartado.

## Dados e API

Migração `drizzle/0002_tense_black_tom.sql`: contacts, opportunities, outreach_drafts, activities, tasks, enums, índices e constraints. Aplicada ao PostgreSQL local, depois repetida com sucesso. Dados anteriores preservados.

Principais endpoints sob `/api/v1`:

| Método | Caminho | Resultado |
|---|---|---|
| GET/POST | `/companies/:id/contacts` | Listar/cadastrar contatos |
| POST | `/contacts/:id/opt-out` | Bloquear contato e interromper pendências |
| GET/POST | `/opportunities` | Listar/criar oportunidade |
| GET | `/opportunities/:id` | Oportunidade, rascunhos e tarefas |
| POST | `/opportunities/:id/drafts` | Template revisável por persona |
| POST | `/opportunities/:id/tasks` | Lembrete manual |
| GET | `/drafts/:id` | Texto e snapshots |
| POST | `/drafts/:id/edit` | Editar, incrementar versão e remover aprovação |
| POST | `/drafts/:id/approve` | Aprovar com `attestation: reviewed` |
| POST | `/drafts/:id/reject` | Descartar rascunho não enviado |
| POST | `/drafts/:id/copy-content` | Validar e obter texto aprovado; não registra envio |
| POST | `/drafts/:id/copied` | Registrar cópia; não registra envio |
| POST | `/drafts/:id/confirm-sent` | Exige versão, `confirmation: sent_manually` e `requestKey` UUID |
| GET | `/outreach/queue` | Fila de revisão, paginada |
| GET | `/tasks` | Tarefas, paginadas |
| POST | `/tasks/:id/status` | Concluir/cancelar tarefa pendente |
| POST | `/admin/products/:id/claims` | Atualizar catálogo versionado (owner) |

Viewer não executa mutações. Todas usam sessão/origem e validação já existentes. Auditoria guarda ator, entidade, ação e versão, sem copiar o texto de mensagem para logs técnicos. Envio confirmado gera atividade com responsável, horário do registro e mudança de estágio. Não há endpoint que permita marcar won por inferência.

## Executar e verificar

```powershell
npm ci
npm run db:migrate
npm run dev
# Em outro terminal:
npm test
npm run typecheck
npm run test:smoke
npm run test:research
npm run test:outreach
npm run test:browser
npm run build
```

O teste de navegador usa Playwright 1.63.0 e Edge instalado, em modo headless com perfil temporário, somente no servidor local. Alternativa: definir `TEST_BROWSER_CHANNEL=chrome` para Chrome instalado. Não requer instalar outro navegador nem acessar conta externa. Nenhuma variável nova é necessária à aplicação.

Resultados: 15 testes unitários aprovados; teste HTTP da etapa 3 aprovado, incluindo concorrência, dedupe, fonte/catálogo desatualizados, permissões, bloqueio e cancelamento por opt-out. Edge validou login, geração, aprovação, cópia real, diferença entre copiar e enviar, confirmação, tarefa e opt-out; layout móvel sem overflow horizontal e sem erros de JavaScript. Nenhuma requisição externa foi feita pela página durante o teste. As fixtures foram removidas após a execução.

Capturas locais: `test-results/etapa-3-aprovacao-desktop.png` e `test-results/etapa-3-envio-mobile.png` (ignoradas no Git). Testes de regressão e build também registrados no README atualizado.

## Escopo restante

Contatos e oportunidades da etapa 1 foram acrescentados como pré-requisito. Atualização v0.4.2: importação CSV, validação de CNPJ, busca/filtros, edição de contatos, responsáveis e quadro do pipeline foram entregues na [etapa 1](ETAPA_1.md). As transições automáticas limitam-se a revisão, envio explicitamente confirmado e bloqueio por opt-out; não inferem resposta/venda.

Próxima etapa do blueprint: memória de conversa, registro de respostas, extração revisável de insights e próximos passos. Exportação/exclusão de dados pessoais, retenção, contas reais e preparação de produção permanecem pendentes conforme README. Tarefas são lembretes na aplicação, sem notificações externas, sequências ou envio automático.
