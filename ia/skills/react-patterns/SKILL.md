---
name: react-patterns
description: 'React project conventions for team-report: Bun as package manager and script runner (never npm/npx), component structure, custom hooks, feature-based folder organization, data fetching with TanStack Query, and state management with Zustand. Use when creating components, hooks, API integrations, installing dependencies, running project scripts, or deciding where a new file/state should live.'
---

# Padrões de Projeto React — team-report

## Quando usar
- Criar um novo componente, hook ou tela.
- Decidir onde um arquivo deve ficar na estrutura de pastas.
- Integrar uma nova chamada à API do Jira.
- Decidir se um estado deve ser local, de contexto ou global (Zustand).
- Instalar/remover dependências ou rodar qualquer script do projeto (dev, build, typecheck, testes).

## Gerenciador de pacotes — Bun
O projeto roda com **Bun**, não com npm. Nunca use `npm`, `npx`, `yarn` ou `pnpm`, nem em comandos sugeridos ao usuário.

| Em vez de | Use |
|---|---|
| `npm install` | `bun install` |
| `npm ci` | `bun install --frozen-lockfile` |
| `npm install <pkg>` | `bun add <pkg>` |
| `npm install -D <pkg>` | `bun add -d <pkg>` |
| `npm uninstall <pkg>` | `bun remove <pkg>` |
| `npm run <script>` | `bun run <script>` (ex.: `bun run dev`, `bun run build`, `bun run typecheck`) |
| `npx <bin>` | `bunx <bin>` |
| `npm audit` | `bun audit` |
| `npm outdated` / `npm update` | `bun outdated` / `bun update` |

- O lockfile é o `bun.lock`, e ele deve ser versionado. Não gere nem commite `package-lock.json`, `yarn.lock` ou `pnpm-lock.yaml`.
- Para rodar o script `test` do `package.json`, use `bun run test`. `bun test` executa o test runner nativo do Bun e ignora o script.

## Estrutura de pastas (feature-based)

```
src/
├── features/
│   └── <feature>/           # ex: team-reports, filters
│       ├── components/      # componentes específicos da feature
│       ├── hooks/           # hooks específicos da feature
│       ├── api/             # queries/mutations TanStack Query da feature
│       └── store/           # slice Zustand da feature, se necessário
├── components/               # componentes compartilhados/reutilizáveis (design system)
├── hooks/                     # hooks genéricos compartilhados
├── api/
│   └── jira-client.ts         # client HTTP base (fetch/axios) com auth e config
├── store/                     # stores Zustand globais (ex: usuário atual, tema)
└── lib/                       # utilitários puros (formatação de data, etc.)
```

Regra: se um componente/hook é usado por mais de uma feature, ele sobe para `src/components` ou `src/hooks`. Caso contrário, fica dentro da feature.

## Componentes
- Sempre functional components com hooks — nunca class components.
- Um componente = um arquivo = um nome de export (nome do arquivo em PascalCase igual ao componente).
- Props tipadas explicitamente (TypeScript interface/type), nunca `any`.
- Prefira composição (children, render props simples) a props booleanas em excesso para variantes de UI (`isPrimary`, `isLarge`, `isDisabled` empilhadas) — extraia variantes explícitas.
- Componentes de apresentação (UI pura) não chamam hooks de data fetching diretamente; recebem dados via props. Quem busca dados é o componente de "container"/tela ou um hook dedicado.

## Custom Hooks
- Prefixo `use` sempre. Nome descreve o que o hook retorna, não a implementação (`useTeamReport`, não `useFetchTeamReportData`).
- Um hook por arquivo, colocado em `hooks/` da feature (ou `src/hooks` se compartilhado).
- Hooks de data fetching (`useXxxQuery`/`useXxxMutation`) ficam em `api/` da feature, encapsulando o `useQuery`/`useMutation` do TanStack Query — componentes nunca chamam `useQuery` diretamente, sempre através de um hook nomeado do domínio.
- Hooks de estado de UI local complexo (ex: um formulário de filtros com várias regras) podem existir em `hooks/`, separando lógica de estado da renderização.

## Data Fetching — TanStack Query
- Toda chamada à API do Jira passa por uma função de `api/` (ex: `fetchIssuesByJql`) usada dentro de um hook `useXxxQuery`.
- Query keys estruturadas como array hierárquico: `['issues', { jql, from, to }]` — nunca strings soltas.
- Definir `staleTime`/`gcTime` explicitamente por tipo de dado (dados de relatório podem ter cache mais longo que listas de projetos/usuários).
- Erros de rede/API tratados no nível do hook (retornar estado de erro tipado), nunca deixados para o componente lidar com exceções cruas.
- Mutações (ex: salvar uma view de relatório) usam `useMutation` com invalidação explícita das queries afetadas (`queryClient.invalidateQueries`).

## Estado — Zustand
- Zustand é para estado **global** e compartilhado entre features (ex: filtros ativos do relatório, usuário atual, preferências de UI).
- Estado local de um único componente (ex: se um dropdown está aberto) continua em `useState`/`useReducer` — não colocar no Zustand.
- Um store por domínio de estado, em `store/` da feature ou `src/store` se for global de verdade (ex: `useReportFiltersStore`, `useUserPreferencesStore`).
- Actions ficam dentro do próprio store (não em hooks separados) para manter estado e mutações juntos.
- Nunca guardar dados de servidor (resultado de API) no Zustand — isso é responsabilidade do cache do TanStack Query. Zustand guarda só estado de UI/cliente.

## Checklist ao criar algo novo
- [ ] Dependências instaladas e scripts rodados com `bun` (nenhum `npm`/`npx` e nenhum `package-lock.json`)?
- [ ] O componente/hook está na pasta certa (feature vs. compartilhado)?
- [ ] Dados de servidor via TanStack Query (nunca em `useState` solto ou Zustand)?
- [ ] Estado de UI compartilhado entre telas via Zustand; estado local via `useState`?
- [ ] Hook de data fetching nomeado pelo domínio, não pela implementação?
- [ ] Props do componente tipadas, sem `any`?
