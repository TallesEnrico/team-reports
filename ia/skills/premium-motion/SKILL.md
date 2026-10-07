---
name: premium-motion
description: 'Design and implement high-end, motion-rich "Apple-esque/Linear-tier" UI: nested double-bezel cards, choreographed scroll/hover animations, bold texture archetypes (glass/editorial/soft-structuralism). Use for marketing/landing pages or areas that need premium, agency-level visual polish rather than a plain minimalist look.'
---

# Premium Motion / Glass UI

Estilo de referência: "Principal UI/UX Architect & Motion Choreographer" — voltado a landing pages, marketing e áreas que precisam de sensação de produto premium/agência de ponta, com profundidade tátil e microinterações coreografadas. Diferente da skill `minimalist-ui`: aqui o movimento e a textura são parte central da identidade visual, não apenas um detalhe sutil.

## Quando usar
- Construir ou revisar uma landing page, hero section ou área de marketing/apresentação do produto.
- Quando o pedido for por um visual "de agência", sofisticado, com bastante movimento e profundidade.
- NÃO usar para telas de dados/relatório do dia a dia (para isso, prefira `minimalist-ui`) — os dois estilos não devem ser misturados na mesma tela.

## Restrições (evitar sempre)
- Fontes genéricas: Inter, Roboto, Arial, Open Sans, Helvetica — prefira fontes premium (`Geist`, `Clash Display`, `PP Editorial New`, `Plus Jakarta Sans`).
- Ícones grossos padrão (Lucide, FontAwesome, Material Icons) — prefira traços ultra-finos e precisos (Phosphor Light, Remix Line).
- Bordas genéricas cinza 1px sólidas e sombras duras/escuras (`shadow-md`, `rgba(0,0,0,0.3)`).
- Navbars sticky coladas na borda superior; grids simétricos de 3 colunas estilo Bootstrap sem whitespace.
- Transições padrão `linear`/`ease-in-out`; mudanças de estado instantâneas sem interpolação.

## Motor de variação criativa
Antes de codar, escolher (silenciosamente) uma combinação de arquétipos para evitar que o resultado pareça sempre igual:

**A. Arquétipo de textura/vibe (escolher 1)**
1. *Ethereal Glass* (SaaS/AI/Tech): preto OLED profundo (`#050505`), gradientes radiais sutis (glow roxo/esmeralda), cards vantablack com `backdrop-blur-2xl` pesado e hairlines brancas translúcidas, tipografia grotesk larga.
2. *Editorial Luxury* (lifestyle/imobiliário/agência): creme quente (`#FDFBF7`), sálvia/espresso, serifada variável de alto contraste para títulos grandes, textura de grão/filme sutil (`opacity-[0.03]`).
3. *Soft Structuralism* (consumo/saúde/portfólio): fundo prateado/branco, tipografia grotesk bold, componentes flutuantes com sombras ambient muito difusas e suaves.

**B. Arquétipo de layout (escolher 1)**
1. *Asymmetrical Bento*: grid tipo masonry com cards de tamanhos variados (`col-span-8 row-span-2` ao lado de `col-span-4` empilhados); no mobile colapsa para coluna única (`grid-cols-1`, `gap-6`).
2. *Z-Axis Cascade*: elementos empilhados como cartões físicos sobrepostos com profundidade e rotação leve (`-2deg`/`3deg`); no mobile remove rotações/overlaps e empilha verticalmente.
3. *Editorial Split*: tipografia grande na metade esquerda, cards/pills de imagem com scroll horizontal na direita; no mobile vira stack vertical full-width, com o bloco de texto no topo.

Regra universal de mobile: qualquer layout assimétrico acima de `md:` deve cair agressivamente para `w-full`, `px-4`, `py-8` abaixo de 768px. Nunca usar `h-screen` para seções full-height — usar `min-h-[100dvh]` para evitar salto de viewport no iOS Safari.

## Microestética tátil (componentes)
- **Double-Bezel (arquitetura aninhada)**: nunca colocar um card/imagem/container direto no fundo. Usar casca externa (wrapper com fundo sutil `bg-black/5`/`bg-white/5`, `ring-1 ring-black/5` ou borda branca translúcida, padding `p-1.5`–`p-2`, raio grande `rounded-[2rem]`) + núcleo interno (conteúdo real, fundo próprio, realce interno `shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]`, raio concêntrico menor calculado, ex: `rounded-[calc(2rem-0.375rem)]`).
- **Botões CTA em pílula com ícone aninhado**: botão primário totalmente arredondado (`rounded-full`), padding generoso (`px-6 py-3`); se houver seta/ícone, ele fica dentro de um círculo próprio (`w-8 h-8 rounded-full bg-black/5 dark:bg-white/10`) encostado no padding interno direito do botão — nunca "nu" ao lado do texto.
- **Ritmo espacial**: dobrar o padding padrão — `py-24` a `py-40` entre seções. Precedendo H1/H2 importantes, usar "eyebrow tags" (badge pequeno em pílula, `px-3 py-1`, `text-[10px]` uppercase, tracking `0.2em`).

## Coreografia de movimento
- Nunca usar transições padrão — sempre `cubic-bezier` customizado (ex: `transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]`), simulando física de massa/mola.
- **Nav flutuante**: navbar como pílula de vidro destacada do topo (`mt-6 mx-auto w-max rounded-full`); hambúrguer que rotaciona/translada suavemente até formar um "X" (não apenas some); menu expandido em overlay full-screen com `backdrop-blur-3xl` pesado; links internos entram com fade+slide-up escalonado (`delay-100`, `delay-150`, `delay-200`...).
- **Hover magnético em botões**: usar utilitário `group`; escala do botão inteiro reduz levemente ao clicar (`active:scale-[0.98]`); ícone interno translada na diagonal (`group-hover:translate-x-1 group-hover:-translate-y-[1px]`) e escala um pouco (`scale-105`).
- **Entrada no scroll**: elementos nunca aparecem estáticos — fade-up pesado com blur (`translate-y-16 blur-md opacity-0` → `translate-y-0 blur-0 opacity-100` em 800ms+), via `IntersectionObserver` ou `whileInView` (Framer Motion); nunca listener de `scroll` bruto.

## Guardrails de performance
- Animar somente `transform`/`opacity` — nunca `top`, `left`, `width`, `height`. `will-change: transform` só em elementos ativamente animando.
- `backdrop-blur` apenas em elementos fixos/sticky (navbar, overlay) — nunca em containers de scroll ou áreas grandes de conteúdo (repaint contínuo de GPU).
- Texturas de grão/ruído só em pseudo-elementos fixos (`position: fixed; inset: 0; pointer-events: none; z-index: 50`) — nunca presos a containers de scroll.
- Disciplina de `z-index`: reservar apenas para camadas sistêmicas (nav sticky, modais, overlays, tooltips) — nunca `z-50`/`z-[9999]` arbitrário.

## Procedimento de execução
1. Escolher o arquétipo de vibe (A) e de layout (B) com base no contexto do pedido, para garantir um resultado único mas sempre premium.
2. Estabelecer textura de fundo, escala de macro-whitespace e tamanhos tipográficos grandes.
3. Construir o DOM usando a técnica Double-Bezel em todos os cards/inputs/grids principais, com raios exagerados tipo squircle (`rounded-[2rem]`).
4. Adicionar as transições `cubic-bezier` customizadas, revelações escalonadas de navegação e física de hover botão-em-botão.
5. Entregar código React/Tailwind/HTML pixel-perfect, sem fallbacks genéricos.

## Checklist de conformidade
- [ ] Nenhuma fonte/ícone/borda/sombra/layout/movimento banido da lista de restrições está presente.
- [ ] Um arquétipo de vibe e um de layout foram escolhidos conscientemente e aplicados.
- [ ] Cards e containers principais usam a arquitetura Double-Bezel (casca externa + núcleo interno).
- [ ] CTAs usam o padrão de ícone aninhado em botão-em-botão, quando aplicável.
- [ ] Padding de seção no mínimo `py-24`.
- [ ] Todas as transições usam curvas `cubic-bezier` customizadas — nada de `linear`/`ease-in-out` padrão.
- [ ] Animações de entrada no scroll presentes em todos os blocos principais.
- [ ] Layout colapsa graciosamente abaixo de 768px para coluna única com `w-full`/`px-4`.
- [ ] Animações usam apenas `transform`/`opacity`; `backdrop-blur` só em elementos fixos/sticky.
