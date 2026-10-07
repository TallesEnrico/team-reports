---
name: minimalist-ui
description: 'Design and implement clean, editorial-style minimalist UI: warm monochrome palette, typographic contrast, flat bento grids, muted pastel accents. Use when building or reviewing frontend layouts, choosing colors/fonts/spacing, or when a design/style review flags generic-looking UI.'
---

# Minimalist Editorial UI

Estilo de referência: "Premium Utilitarian Minimalism" — interfaces limpas, tipo documento, análogas a plataformas de produtividade de alto nível (ex: Notion, Linear em modo claro). Rejeita tendências genéricas de SaaS (gradientes, sombras pesadas, ícones finos padrão).

## Quando usar
- Construir uma nova tela/componente de frontend do zero.
- Revisar um layout existente contra um padrão editorial minimalista.
- Escolher paleta de cores, tipografia, espaçamento ou estilo de card/botão/badge.

## Restrições (evitar sempre)
- Fontes genéricas: Inter, Roboto, Open Sans.
- Bibliotecas de ícone de traço fino padrão (Lucide, Feather, Heroicons básico).
- Sombras pesadas do Tailwind (`shadow-md`, `shadow-lg`, `shadow-xl`) — sombras devem ser quase imperceptíveis (opacidade < 0.05) ou inexistentes.
- Fundos coloridos primários em elementos/seções grandes (sem hero azul, verde ou vermelho vibrante).
- Gradientes, cores neon, glassmorphism 3D.
- `rounded-full` (pílula) em containers grandes, cards ou botões primários.
- Emojis em qualquer lugar (código, markup, texto, headings, alt text) — use ícones/SVG.
- Placeholders genéricos ("John Doe", "Acme Corp", "Lorem Ipsum") — use conteúdo realista e contextual.
- Clichês de copywriting de IA ("Elevate", "Seamless", "Unleash", "Next-Gen", "Delve") — linguagem direta e específica.

## Tipografia
- Corpo/UI/botões: fonte sans-serif geométrica com caráter (ex: `SF Pro Display`, `Geist Sans`, `Helvetica Neue`).
- Títulos editoriais/citações: serifada com tracking apertado (`letter-spacing: -0.02em` a `-0.04em`) e `line-height: 1.1` (ex: `Newsreader`, `Playfair Display`, `Instrument Serif`).
- Dados/código/metadata: monoespaçada (ex: `Geist Mono`, `SF Mono`, `JetBrains Mono`).
- Texto nunca em preto absoluto (`#000000`) — use quase-preto (`#111111`/`#2F3437`) com `line-height: 1.6`. Texto secundário em cinza muted (`#787774`).

## Paleta de cores (monocromática quente + pastéis pontuais)
- Fundo: branco puro `#FFFFFF` ou bege/off-white quente `#F7F6F3` / `#FBFBFA`.
- Superfície primária (cards): `#FFFFFF` ou `#F9F9F8`.
- Bordas/divisores: cinza ultra-claro `#EAEAEA` ou `rgba(0,0,0,0.06)`.
- Acentos: exclusivamente pastéis dessaturados, só para tags/badges/backgrounds de ícone:
  - Vermelho pálido `#FDEBEC` (texto `#9F2F2D`)
  - Azul pálido `#E1F3FE` (texto `#1F6C9F`)
  - Verde pálido `#EDF3EC` (texto `#346538`)
  - Amarelo pálido `#FBF3DB` (texto `#956400`)
- Tema escuro: as mesmas variáveis com outros valores (`:root[data-theme='dark']` em `src/styles/global.css`): grafite quente (fundo `#1B1B1A`, cartão `#222221`, texto `#D4D4D0`), e os pastéis viram fundos escuros com a tinta clara. No código, use sempre as variáveis (`var(--surface)`, `bg-blue-soft`…), nunca os hex desta lista: cor fixa não muda no escuro.

## Componentes
- **Grids bento**: CSS Grid assimétrico; cards com `border: 1px solid #EAEAEA`, raio de `8px`–`12px` no máximo, padding generoso (`24px`–`40px`).
- **Botão primário (CTA)**: fundo sólido `#111111`, texto branco, raio `4px`–`6px`, sem `box-shadow`; hover com leve mudança de cor (`#333333`) ou `transform: scale(0.98)`.
- **Tags/badges**: formato pílula (`border-radius: 9999px`), texto pequeno (`text-xs`), uppercase com tracking largo (`0.05em`), fundo em um dos pastéis definidos acima.
- **Accordions**: sem caixa/container — separar itens só com `border-bottom: 1px solid #EAEAEA`; ícone `+`/`-` limpo para o toggle.
- **Atalhos de teclado**: renderizar como tecla física (`<kbd>`), `border: 1px solid #EAEAEA`, `border-radius: 4px`, fundo `#F7F6F3`, fonte monoespaçada.

## Ícones e imagens
- Ícones de sistema: traço técnico uniforme, ligeiramente mais grosso (ex: Phosphor Bold/Fill, Radix Icons).
- Ilustrações: sketches monocromáticos de linha contínua sobre fundo branco, com uma única forma geométrica em pastel muted.
- Fotografia: imagens dessaturadas e de tom quente, nunca stock photo saturada; aplicar overlay sutil (`opacity: 0.04`, grão quente) para integrar à paleta monocromática. Use `https://picsum.photos/seed/{contexto}/1200/800` como placeholder confiável quando faltar asset real.
- Seções não devem ficar vazias/planas: usar imagem de fundo em opacidade muito baixa, `radial-gradient` sutil em tom quente (`opacity: 0.03`) ou padrões geométricos de linha mínimos.

## Movimento (sutil, quase invisível)
- Entrada no scroll: `translateY(12px)` + `opacity: 0` resolvendo em `600ms` com `cubic-bezier(0.16, 1, 0.3, 1)`, via `IntersectionObserver` (nunca listener de `scroll`).
- Hover: leve elevação de sombra (`box-shadow` de `0 0 0` para `0 2px 8px rgba(0,0,0,0.04)` em `200ms`); botões respondem com `scale(0.98)` em `:active`.
- Listas/grids: revelação escalonada (`animation-delay: calc(var(--index) * 80ms)`), nunca tudo montado de uma vez.
- Performance: animar só `transform`/`opacity` (nunca `top`/`left`/`width`/`height`); `will-change: transform` só em elementos ativamente animando.

## Procedimento de execução
1. Estabelecer o macro-whitespace primeiro — padding vertical generoso entre seções (`py-24`/`py-32` em Tailwind).
2. Restringir a largura do conteúdo tipográfico principal (`max-w-4xl`/`max-w-5xl`).
3. Aplicar a hierarquia tipográfica e as variáveis de cor monocromáticas definidas acima.
4. Garantir que todo card/divisor/borda siga a regra `1px solid #EAEAEA`.
5. Adicionar animações de entrada em scroll aos blocos de conteúdo principais.
6. Dar profundidade visual às seções (imagem, gradiente ambiente, textura sutil) — nunca fundo vazio e plano.

## Checklist de conformidade
- [ ] Nenhuma fonte/ícone/sombra/layout banido da lista de restrições está presente.
- [ ] Paleta monocromática quente aplicada; cor usada só como pastel de acento.
- [ ] Cards/bordas seguem `1px solid #EAEAEA` com raio ≤ 12px.
- [ ] Tipografia segue a hierarquia serif/sans/mono definida.
- [ ] Espaçamento generoso entre seções (mínimo `py-24`).
- [ ] Animações usam apenas `transform`/`opacity` com easing customizado, via `IntersectionObserver`.
- [ ] Sem emojis, placeholders genéricos ou clichês de copywriting.
