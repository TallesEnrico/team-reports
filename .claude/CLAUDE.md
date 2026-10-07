# team-report

## Estrutura de IA (fonte única em `ia/`)

Agents, skills e instructions deste projeto vivem em `ia/`. Os arquivos em `.claude/`, `.github/` e `.cursor/` são apenas adapters que apontam para lá.

- Para alterar um agent, skill ou instruction, edite o arquivo canônico em `ia/`. Não coloque conteúdo real nos adapters.
- Ao criar um item novo, ou ao mudar `name`/`description` de um existente, atualize os adapters das três ferramentas conforme `ia/README.md`.

## Instructions

@../ia/instructions/team-reports-domain.md
@../ia/instructions/kanban-domain.md
@../ia/instructions/metrics-domain.md
@../ia/instructions/builder-domain.md
@../ia/instructions/mcp-domain.md
@../ia/instructions/p2p-domain.md
