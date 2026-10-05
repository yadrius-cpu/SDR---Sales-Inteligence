# Arquitetura dos produtos e acessos

Versão 1.0 · 29/09/2026

Este documento registra a nova direção do produto: manter o PhishShield protegido e criar uma frente pública e genérica de Sales Intelligence para empresas clientes.

**Status:** fundação de acesso e cadastro público implementados. O próximo passo é concluir o onboarding comercial por etapas.

**Regra explícita de inteligência:** a IA poderá analisar leads, classificar aderência ao ICP, sugerir decisores, recomendar próximas ações e preparar mensagens. Ela nunca enviará mensagens, fará contatos ou executará ações externas automaticamente. Toda recomendação e toda abordagem exigem revisão e confirmação humana.

## 1. Decisão principal

O sistema terá duas frentes de produto:

1. **PhishShield** — produto de segurança, com acesso restrito e controlado pelo administrador master da plataforma.
2. **Sales Intelligence** — produto comercial, com cadastro público de empresas e gestão de equipes por cada empresa.

As duas frentes podem compartilhar autenticação, usuários e empresas, mas devem manter módulos, telas, permissões e regras de negócio separados.

O cadastro público nunca concede acesso automático ao PhishShield. Por padrão, todo novo cadastro recebe acesso somente ao Sales Intelligence.

## 2. Hierarquia de administração

### 2.1 Administrador master da plataforma

É o administrador global, controlado pelo proprietário da plataforma.

Pode:

- acessar o PhishShield;
- acessar o Sales Intelligence;
- visualizar e administrar todas as empresas;
- criar, bloquear e editar usuários de qualquer empresa;
- conceder ou remover acesso a cada produto;
- criar usuários com acesso exclusivo ao PhishShield;
- administrar configurações globais, auditoria e segurança.

Esse usuário não deve ser identificado apenas por um e-mail fixo. A autorização deve usar uma função persistida, como `platform_superadmin`, protegida no servidor.

### 2.2 Administrador da empresa

É o administrador de uma empresa cliente.

Pode:

- editar o perfil da própria empresa;
- preencher ou atualizar o diagnóstico comercial;
- convidar e remover funcionários da própria empresa;
- atribuir funções internas no Sales Intelligence;
- controlar o acesso dos funcionários ao Sales Intelligence;
- visualizar os dados comerciais pertencentes à própria empresa.

Não pode:

- visualizar outra empresa;
- administrar usuários globais;
- conceder acesso ao PhishShield por conta própria;
- alterar configurações da plataforma;
- acessar dados internos do PhishShield sem autorização explícita do master.

### 2.3 Funcionários da empresa

Funções iniciais sugeridas:

- `company_admin`: administrador da empresa;
- `sales_manager`: gestor comercial;
- `sales_user`: usuário comercial;
- `company_viewer`: usuário somente leitura.

Essas funções pertencem à empresa e não substituem a função global do usuário.

## 3. Modelo de acesso por produto

O acesso deve ser controlado em duas camadas:

1. função global do usuário;
2. produtos autorizados para o usuário ou para a empresa.

Exemplo conceitual:

```text
Usuário master
├── PhishShield
└── Sales Intelligence

Administrador da Empresa A
└── Sales Intelligence da Empresa A

Vendedor da Empresa A
└── Sales Intelligence da Empresa A

Usuário de segurança convidado pelo master
└── PhishShield
```

Permissões recomendadas:

```text
products: ["sales_intelligence"]
products: ["phishshield"]
products: ["phishshield", "sales_intelligence"]
```

O servidor deve verificar produto, empresa e função em toda operação protegida. Esconder um item do menu não é suficiente para proteger os dados.

## 4. Cadastro e login

### 4.1 Cadastro público

O fluxo público deve ser:

1. pessoa informa nome, e-mail e senha;
2. confirma o e-mail, quando essa capacidade estiver disponível;
3. cria a empresa;
4. informa nome, domínio, segmento e país;
5. torna-se `company_admin` da própria empresa;
6. recebe acesso ao Sales Intelligence;
7. é direcionada para o onboarding comercial.

O cadastro público não deve criar acesso ao PhishShield.

### 4.2 Convite de funcionários

O administrador da empresa informa o e-mail do funcionário e escolhe uma função do Sales Intelligence. O funcionário recebe um convite, define a senha e entra somente na empresa para a qual foi convidado.

O convite deve ser limitado à empresa emissora, ter validade e não permitir que o convidado altere a própria função.

### 4.3 Usuários do PhishShield

Somente o master pode criar ou convidar usuários para o PhishShield. O convite deve registrar:

- empresa ou escopo autorizado;
- produto `phishshield`;
- função no PhishShield;
- data de criação, expiração e revogação;
- administrador que concedeu o acesso.

O usuário pode ter acesso somente ao PhishShield ou aos dois produtos, conforme a autorização registrada.

### 4.4 Redirecionamento após login

Após autenticar:

- somente Sales Intelligence: entrar diretamente no Sales Intelligence;
- somente PhishShield: entrar diretamente no PhishShield;
- ambos: mostrar um seletor de produto ou manter o último produto utilizado;
- nenhum produto ativo: informar que o acesso precisa ser revisado pelo administrador.

Não redirecionar usuários com base apenas no tipo de e-mail, domínio ou endereço fixo. O destino deve ser calculado pelas permissões persistidas.

## 5. Isolamento entre empresas

Toda entidade comercial deve possuir `company_id` ou vínculo equivalente. Consultas, alterações, exportações e endpoints devem aplicar o escopo da empresa no servidor.

Regras mínimas:

- um administrador da empresa só acessa dados da própria empresa;
- um funcionário só acessa dados permitidos pela sua função;
- IDs recebidos pelo navegador nunca são considerados autorização;
- ações administrativas devem gerar auditoria;
- o master pode consultar todas as empresas conforme sua função global.

## 6. Onboarding do Sales Intelligence

O onboarding deve ser progressivo. Não exigir todas as respostas em uma única tela.

### Etapa 1 — Empresa e contexto

- nome e nome comercial;
- site e domínio;
- país, estado e cidade;
- segmento de atuação;
- tamanho da empresa;
- descrição curta do negócio.

### Etapa 2 — Oferta

- produtos e serviços;
- principais benefícios;
- faixa de preço ou ticket médio;
- diferenciais;
- concorrentes conhecidos;
- regiões atendidas.

### Etapa 3 — Processo comercial

- como os clientes chegam hoje;
- ciclo médio de vendas;
- canais usados;
- tamanho da equipe comercial;
- metas e principais dificuldades;
- CRM ou planilhas existentes.

### Etapa 4 — Cliente ideal

- segmentos prioritários;
- porte das empresas-alvo;
- regiões-alvo;
- cargos dos decisores;
- dores e necessidades conhecidas;
- critérios de exclusão.

### Etapa 5 — Inteligência inicial

O sistema transforma as respostas em:

- perfil de cliente ideal (ICP);
- personas e decisores;
- segmentos prioritários;
- hipóteses comerciais;
- recomendações de prospecção;
- perguntas para completar informações faltantes.

As recomendações geradas por IA devem ser apresentadas como hipótese quando não houver evidência suficiente e devem permanecer revisáveis por um usuário humano.

## 7. Limites entre os produtos

### PhishShield

- continua sendo uma frente restrita;
- não deve ser alterado durante a criação do Sales Intelligence sem decisão específica;
- possui usuários e permissões próprias;
- não deve expor seus dados internos aos clientes do Sales Intelligence;
- integrações futuras devem ocorrer por API ou eventos controlados.

### Sales Intelligence

- é a frente genérica e orientada a clientes;
- suporta várias empresas isoladas entre si;
- possui onboarding comercial próprio;
- permite que cada empresa cadastre sua equipe;
- não recebe automaticamente dados privados do PhishShield.

## 8. Estrutura conceitual de dados

Entidades mínimas:

```text
users
companies
company_memberships
product_access
invitations
roles
sessions
audit_logs
company_profiles
products_services
ideal_customer_profiles
personas
leads
opportunities
insights
```

Regras importantes:

- `users` representa a identidade da pessoa;
- `companies` representa a empresa cliente;
- `company_memberships` liga usuários a empresas e registra a função local;
- `product_access` registra quais produtos estão autorizados;
- `invitations` controla convites e sua expiração;
- `audit_logs` registra alterações sensíveis;
- dados comerciais sempre possuem escopo de empresa;
- acesso ao PhishShield deve ter escopo e função próprios.

## 9. Roadmap de implementação

### Fase 1 — Fundação de acesso

- separar funções globais e funções da empresa;
- criar `company_memberships` e `product_access`;
- manter o login existente funcionando;
- definir redirecionamento por produto;
- proteger o PhishShield por autorização de servidor.

### Fase 2 — Cadastro público

- cadastro de usuário;
- criação da empresa;
- criação automática do primeiro `company_admin`;
- entrada no Sales Intelligence;
- validações e auditoria.

### Fase 3 — Equipe da empresa

- convites;
- ativação de funcionários;
- funções internas;
- remoção e bloqueio;
- tela de membros da empresa.

### Fase 4 — Onboarding comercial

- formulário por etapas;
- salvamento parcial;
- progresso do onboarding;
- edição posterior das respostas;
- resumo do perfil da empresa.

### Fase 5 — Primeiros insights

- ICP;
- personas;
- segmentos prioritários;
- recomendações revisáveis;
- dashboard inicial.

### Fase 5.1 — Inteligência assistida de leads

- classificação de aderência ao ICP;
- explicação da classificação com os dados disponíveis;
- sugestão de persona e decisor;
- hipótese de dor ou necessidade;
- recomendação de próxima ação;
- rascunho de mensagem revisável.

Nenhum resultado dessa fase pode enviar mensagens, convidar contatos, alterar o pipeline ou disparar qualquer ação externa sem confirmação explícita de um usuário autorizado.

### Fase 6 — Operação comercial

- leads e contas;
- oportunidades;
- tarefas;
- importação de planilhas;
- integrações com CRM quando necessário.

## 10. Decisões de segurança

- autorização sempre no servidor;
- sessões protegidas e revogáveis;
- convites com expiração e uso único;
- recuperação de senha segura;
- auditoria para concessão e revogação de acessos;
- separação de dados por empresa;
- proteção contra enumeração de usuários e empresas;
- não expor chaves ou dados do PhishShield ao Sales Intelligence;
- testes de acesso cruzado entre empresas antes de liberar o cadastro público.

## 11. Pendências para decisões futuras

- definir se o Sales Intelligence terá planos pagos;
- definir se uma pessoa poderá pertencer a várias empresas;
- definir quais funções existirão no PhishShield;
- definir se o acesso ao PhishShield será por usuário, empresa ou ambos;
- definir verificação de domínio/e-mail corporativo;
- definir política de exclusão e retenção de dados;
- definir quais integrações serão priorizadas após o MVP.

## 12. Regra de implementação

As mudanças devem ser feitas de forma incremental. O PhishShield existente deve continuar funcionando durante cada fase. Qualquer alteração que modifique autenticação, banco ou permissões deve incluir migração, testes de autorização e uma forma segura de manter o usuário master com acesso.
