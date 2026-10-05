# Validação do blueprint — 25/09/2026

Parecer técnico: aprovado para iniciar por estágios, com esclarecimentos abaixo. O arquivo original foi preservado. Está codificado corretamente em UTF-8; exibição incorreta de acentos no PowerShell sem `-Encoding UTF8` não é defeito do documento.

## Pontos resolvidos nesta fundação

- Stack: Next.js/TypeScript, PostgreSQL e Drizzle. Aplicação e banco comerciais independentes. Dependências verificadas no registro npm e fixadas no lockfile.
- Domínio é índice não exclusivo. Duplicação exige revisão explícita, pois filiais podem compartilhar domínio. Sem domínio continua sendo cadastro válido. Ainda falta validação/dedupe por CNPJ.
- Autenticação local individual com owner/operator/viewer e permissões verificadas em cada chamada do servidor. Contas fictícias apenas para desenvolvimento.
- Produto inicia com `approved_claims: []`. Nenhuma capacidade foi inferida a partir do nome PhishShield.
- Auditoria inicial registra ator, entidade, ação e horário em transação; não copia conteúdo pessoal para snapshots. Histórico de mudanças de campos/estágios será acrescentado quando essas operações existirem.

## Esclarecimentos necessários para estágios seguintes

1. Definir a oportunidade como fonte de verdade do pipeline; situação da empresa e participação na campanha não devem gerar três pipelines divergentes.
2. `customer_statement` precisa de vínculo obrigatório com atividade/trecho; o modelo conceitual menciona essa regra, mas não lista `activity_id` em evidence. Acrescentar na migração do estágio correspondente.
3. Versão de catálogo/prompt e snapshot de alegações precisam ficar no draft. Alterar catálogo não pode reescrever justificativa histórica de uma mensagem.
4. Opt-out deve bloquear geração, aprovação e confirmação de contato nos serviços, além de interromper tarefas; definir como propagar para oportunidades e como registrar reconsentimento.
5. Exclusão deve alcançar atividades, trechos, drafts, exports, jobs, logs e backups segundo política definida. Não preservar PII indiretamente em auditoria; retenção mínima necessária precisa de decisão específica.
6. Unicidade por CNPJ validado requer tratamento de matriz/filial e estratégia explícita para conflito CNPJ versus domínio.
7. Idempotência em importações/envios confirmados e concorrência de estados precisam de constraints/transações, não só validação na tela. Cadastro simples ainda não oferece chave de idempotência.
8. Métricas futuras devem definir coorte/janela e unidade (empresa, contato ou oportunidade). Contagens atuais são estoque cadastrado, não taxas de conversão.
9. Conector web depende de fonte permitida e defesas SSRF incluindo redirecionamentos/DNS. Sem fonte validada, manter evidência manual; não inventar pesquisa.

## Pendências do responsável pelo produto

Capacidades reais do PhishShield; hospedagem; operadores reais; fornecedor e orçamento de LLM; fonte licenciada; retenção/base de tratamento; volume semanal; definição de lead qualificado. Nenhuma impede a demonstração local. Matriz de capacidades está em documento separado para preenchimento com evidência.

## Estado dos estágios

| Estágio | Situação |
|---|---|
| 0 — fundação | Aplicação, login, papéis, migração e seed verificados; capacidades reais aguardam validação |
| 1 — CRM | Entregue em v0.4.2: empresas/campanhas/contatos, CSV com prévia e decisões, CNPJ numérico/alfanumérico, filtros/paginação, vínculos, responsáveis, pipeline e histórico. Aceite de 20 linhas e navegador aprovados; detalhes em ETAPA_1.md |
| 2 — pesquisa e evidências | Implementado: LinkedIn manual, fontes, fatos/hipóteses/lacunas, revisão e resumo versionado. Conector Wikidata opcional desabilitado, validado com respostas de teste; consulta externa real não executada |
| 3 — abordagem assistida | Implementado: contatos/oportunidades necessários, templates, aprovação/cópia, confirmação manual, tarefas e opt-out. Testes de API e navegador local aprovados |
| 4 — memória de conversa | Implementado: registro, extração local/contrato OpenAI, citações, revisão, negação vinculada à hipótese, próximos passos e perda revisável. OpenAI desativada; teste real aguarda configuração local |
| 5 — insights e experimentos | Implementado para piloto local: coortes por campanha/período/setor, funil, temas revisados, perdas e experimentos A/B com protocolo fixo, janela e incerteza. Testes de API/PostgreSQL e navegador; detalhes em ETAPA_5.md |
| 6 — integrações | Adiado conforme blueprint; nenhuma integração habilitada |

## Referências técnicas consultadas

- [Instalação do Next.js](https://nextjs.org/docs/pages/getting-started/installation).
- [Drizzle com PostgreSQL e migrações](https://orm.drizzle.team/docs/get-started/postgresql-new).

Esta revisão é técnica e de consistência do escopo. As condições jurídicas e os links de LinkedIn não foram revalidados, pois nenhuma integração ou coleta foi habilitada; a verificação continua obrigatória antes dessa etapa.
