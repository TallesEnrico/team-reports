# ia/: fonte única de agents, skills e instructions

Esta pasta guarda o conteúdo real de todos os agents, skills e instructions do team-report. O projeto é desenvolvido com GitHub Copilot, Claude Code e Cursor, e cada ferramenta procura esses arquivos em uma pasta e em um formato próprios. Por isso `.github/`, `.claude/` e `.cursor/` contêm apenas **adapters**: arquivos curtos com o frontmatter que a ferramenta exige e um link para o arquivo canônico daqui.

Regra: **edite sempre aqui**. Um adapter só muda quando um item é criado, removido ou renomeado, ou quando muda sua `description`.

## Estrutura

```
ia/
├── agents/
│   ├── designer.md
│   ├── frontend-developer.md
│   ├── project-owner.md
│   ├── qa-tester.md
│   └── security-reviewer.md
├── instructions/
│   ├── builder-domain.md
│   ├── kanban-domain.md
│   ├── mcp-domain.md
│   ├── metrics-domain.md
│   ├── p2p-domain.md
│   └── team-reports-domain.md
└── skills/
    ├── minimalist-ui/SKILL.md
    ├── premium-motion/SKILL.md
    └── react-patterns/SKILL.md
```

O frontmatter dos arquivos canônicos tem só `name` e `description`. Configurações específicas de cada ferramenta (tools, handoffs, readonly etc.) ficam nos adapters.

## Onde ficam os adapters

| Tipo | Canônico | GitHub Copilot | Claude Code | Cursor |
|---|---|---|---|---|
| Agent | `ia/agents/<slug>.md` | `.github/agents/<slug>.agent.md` | `.claude/agents/<slug>.md` | `.cursor/agents/<slug>.md` |
| Skill | `ia/skills/<nome>/SKILL.md` | `.github/skills/<nome>/SKILL.md` | `.claude/skills/<nome>/SKILL.md` | `.cursor/skills/<nome>/SKILL.md` |
| Instruction | `ia/instructions/<slug>.md` | `.github/instructions/<slug>.instructions.md` | import `@../ia/instructions/<slug>.md` em `.claude/CLAUDE.md` | `.cursor/rules/<slug>.mdc` |

Cada adapter tem no topo o comentário `<!-- Adapter: ... -->` indicando o arquivo canônico.

## Como adicionar ou alterar

**Alterar conteúdo existente:** edite só o arquivo em `ia/`. Se mudar a `description`, copie o novo texto para os adapters, porque é pela `description` que cada ferramenta decide quando usar o item.

**Novo agent:**
1. Crie `ia/agents/<slug>.md` com `name: <slug>`, `description` e o prompt completo.
2. Crie os três adapters, usando um agent existente como modelo:
   - Copilot: `name` de exibição (ex.: `"QA Tester"`) e `tools`/`agents`/`handoffs` no vocabulário do Copilot.
   - Claude Code: `name` em kebab-case e `tools` no vocabulário do Claude Code (`Read, Edit, Write, Grep, Glob, Bash, WebFetch, WebSearch, TodoWrite, Skill, Agent(...)`).
   - Cursor: `name` em kebab-case e, se o agent não deve alterar nada, `readonly: true`.
3. Se o agent citar outros agents pelo nome, adicione nos adapters do Claude Code e do Cursor a nota que mapeia nome de exibição → slug.

**Nova skill:** crie `ia/skills/<nome>/SKILL.md` (a pasta precisa ter o mesmo nome do campo `name`) e copie o adapter de uma skill existente para `.github/skills/<nome>/`, `.claude/skills/<nome>/` e `.cursor/skills/<nome>/`, trocando nome, descrição, título e link.

**Nova instruction:** crie `ia/instructions/<slug>.md`, depois:
- Copilot: `.github/instructions/<slug>.instructions.md` (use `applyTo` se ela valer para arquivos específicos).
- Cursor: `.cursor/rules/<slug>.mdc` (`globs` para arquivos específicos, `alwaysApply: true` para sempre).
- Claude Code: adicione `@../ia/instructions/<slug>.md` em `.claude/CLAUDE.md`. Para restringir a caminhos específicos, use uma rule em `.claude/rules/<slug>.md` com `paths`.

## Ferramentas por agent

| Agent | Copilot | Claude Code | Cursor |
|---|---|---|---|
| designer | read, edit, search, web, browser | tudo exceto `Bash` (herda MCPs de browser da sessão) | padrão |
| frontend-developer | read, edit, search, execute, todo | Read, Edit, Write, Grep, Glob, Bash, TodoWrite, Skill | padrão |
| project-owner | read, search, todo, agent | Agent(frontend-developer, designer, qa-tester, Explore), Read, Grep, Glob, TodoWrite, Skill | `readonly: true` |
| qa-tester | read, edit, search, execute, todo, browser/Playwright | tudo (herda MCPs de browser da sessão) | padrão |
| security-reviewer | read, search, execute, web | Read, Grep, Glob, Bash, WebFetch, WebSearch, Skill | `readonly: true` |

O Claude Code não tem ferramentas de browser nativas. O designer e o qa-tester herdam as ferramentas da sessão para aproveitar a integração Claude in Chrome ou um MCP de Playwright, se estiverem configurados.

## Leitura cruzada entre ferramentas

Algumas ferramentas também leem as pastas das outras:
- **VS Code (Copilot)** lê `.claude/agents/`, `.claude/skills/`, `.claude/rules/` e `CLAUDE.md`, além de `.github/`.
- **Cursor** lê `.claude/agents/` e `.claude/skills/`, além de `.cursor/`. Quando o nome é igual, o agent de `.cursor/` tem precedência.

Por isso um item pode aparecer duas vezes em algum seletor. Como todos os adapters apontam para o mesmo arquivo canônico, não há conflito de conteúdo.
