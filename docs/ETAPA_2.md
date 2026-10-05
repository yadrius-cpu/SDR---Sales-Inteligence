# Etapa 2 — Pesquisa e evidências

Implementada com prioridade para pesquisa manual no LinkedIn, conforme preferência do usuário. O restante da etapa 1 foi entregue posteriormente em v0.4.2; consulte [etapa 1](ETAPA_1.md).

## Usar

1. Acesse **Empresas** e clique no nome de uma empresa.
2. Pesquise diretamente no LinkedIn. Registre somente dados profissionais necessários cujo uso seja permitido. A aplicação não acessa o perfil por você.
3. Em **Registrar informação**, escolha observado publicamente, hipótese/inferência ou desconhecido. LinkedIn manual é a origem inicial selecionada.
4. Para fatos, informe conteúdo, data, URL, publicador e fundamento da permissão de uso. Não confunda visibilidade da página com autorização irrestrita. Trecho de apoio e validade são opcionais.
5. Confira os dados em **Revisar pesquisa** ou na ficha da empresa. Registre aprovação/rejeição com justificativa. Uma hipótese aprovada continua sendo hipótese.
6. Compile o resumo: somente evidências aprovadas e vigentes entram. Fatos e hipóteses ficam separados; lacunas e uma pergunta genérica de discovery aparecem explicitamente.
7. Edite o resumo, se necessário, criando nova versão; aprove-o após conferir as fontes. Uma correção na evidência exige nova revisão e retira aprovações de resumos. Mudança/expiração das evidências usadas bloqueia reaprovação do resumo desatualizado.

Viewer consulta; operator/owner registram e revisam; apenas owner configura o conector. Todas essas permissões também são verificadas no servidor.

## Banco e API

Migração `drizzle/0001_glorious_bishop.sql`: sources, evidence, research_briefs, research_runs, source_settings, enums, índices e constraint de fonte obrigatória para fato público. Aplicada ao banco local e reaplicada sem efeito destrutivo. Não altera os cadastros existentes.

Endpoints sob `/api/v1`:

| Método | Caminho | Função |
|---|---|---|
| GET | `/companies/:id` | Empresa, evidências e últimas 20 versões de resumo |
| GET/POST | `/companies/:id/evidence` | Consultar/registrar evidência |
| POST | `/companies/:id/evidence/:id/edit` | Corrigir com versão esperada; retorna a pendente |
| POST | `/companies/:id/evidence/:id/review` | Aprovar/rejeitar com versão e justificativa |
| GET/POST | `/companies/:id/briefs` | Histórico/compilar resumo |
| POST | `/companies/:id/briefs/:id/edit` | Nova versão editada pelo operador |
| POST | `/companies/:id/briefs/:id/review` | Revisar última versão sem evidências desatualizadas |
| GET | `/research/review-queue?page=1` | Evidências pendentes, 50 por página |
| POST | `/companies/:id/research` | Consulta opcional Wikidata: entityId Q e requestKey UUID |
| GET/POST | `/admin/research-source` | Estado, habilitação e contato operacional do conector |

Fontes guardam URL, publicador, data de coleta, fundamento declarado e hash. Na entrada manual, o hash cobre o trecho/afirmação registrado, não a página inteira: não há download. Evidências registram data da observação, classificação, validade, versão e revisão. Auditoria de mutações é transacional e não duplica texto pessoal; registra IDs, ação e versão. Não há arquivo histórico integral de cada texto de evidência: snapshots de resumo preservam os textos utilizados em cada versão.

## LinkedIn

É um fluxo manual, sem credenciais, scraping, robô, leitura automática de mensagens, convites ou envio. Links abrem em nova aba. Campos são armazenados como texto e renderizados com escape HTML; não são instruções nem código. Atualização posterior: declarações de contatos (`customer_statement`) são criadas pela revisão de conversas da [etapa 4](ETAPA_4.md), com vínculo ao trecho original. Não classificar declaração privada como fato público.

## Conector público opcional

Wikidata fica desabilitado por padrão e continua desabilitado nesta instalação. Seu uso não é necessário ao fluxo escolhido do LinkedIn. Em **Administração → Configurar fontes de pesquisa**, owner pode habilitar e informar um e-mail operacional válido, enviado no User-Agent conforme a política da fonte.

Consulta somente `https://www.wikidata.org/wiki/Special:EntityData/Q<id>.json`, escolhido pelo operador. Não segue redirecionamentos ou URLs vindas da resposta. DNS IPv4 é verificado contra faixas privadas/reservadas e fixado na conexão TLS; IPs literais/URLs arbitrárias não são aceitos como parâmetro. Limites globais persistidos: uma consulta por minuto, prazo de 10 segundos e 2 MB. Não há retries automáticos. Resposta fora do schema, indisponível ou sem dados não gera evidência.

Importa nome e descrição do registro, com link para revisão específica. Não confirma identidade da empresa, tamanho, dores ou tecnologias. Itens explicitamente classificados como pessoa são recusados; o operador ainda deve confirmar que o item é uma empresa. Sem correspondência, usar cadastro manual. A cobertura de pequenas contabilidades pode ser baixa.

Requisições são síncronas e limitadas; resultado/falha persiste em research_runs. `requestKey` é idempotente por empresa; repetição retorna o resultado anterior sem coleta adicional. Para tentar novamente após falha, usar nova chave e respeitar o intervalo. Fila/worker não foi introduzido para esta consulta curta; adotar antes de lotes ou fontes mais lentas.

Referência verificada: [Wikidata — acesso aos dados e CC0](https://www.wikidata.org/wiki/Wikidata%3AReuse). Permissões de integrações LinkedIn não foram presumidas ou habilitadas.

## Executar e verificar

```powershell
npm run db:migrate
npm run dev
# Em outro terminal:
npm test
npm run typecheck
npm run test:smoke
npm run test:research
npm run build
```

Nenhuma variável de ambiente nova é necessária. Configuração opcional do conector fica no banco, com acesso restrito ao owner.

Verificações: 10 testes unitários aprovados (4 anteriores + 6 de pesquisa), smoke HTTP anterior e novo smoke de pesquisa aprovados com PostgreSQL real. Incluem fonte obrigatória, LinkedIn manual, RBAC, validade, versões/conflitos, resumo sem dados pendentes, invalidação, edição, HTML malicioso escapado, fila e controle de configuração. Testes do conector usam respostas controladas explicitamente: sucesso, falha sem inserção, replay sem duplicata e rate limit. Nenhuma consulta real ao Wikidata foi executada; o teste não comprova disponibilidade externa. Não houve teste visual automatizado em navegador.

## Limites e sequência

O resumo é uma compilação determinística; não há LLM, custo de IA, enriquecimento inventado ou pontuação de confiança percentual. Edição de resumo é texto do operador e precisa de revisão, não extração automática de afirmações. Fontes manuais têm permissão declarada pelo operador, não certificação automática da plataforma. Retenção/exclusão e operação com dados pessoais reais continuam pendentes do fluxo administrativo previsto no blueprint.

Atualização posterior: contatos/oportunidades necessários, drafts e opt-out foram implementados na [etapa 3](ETAPA_3.md). Integração oficial do LinkedIn permanece condicionada a acesso e permissões específicos; não necessária para pesquisa manual.
