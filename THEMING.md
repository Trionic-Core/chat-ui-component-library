# Theming `@cypherx/chat-ui`

Every visible color, font, radius, shadow, and the **chart palette** is driven by
CSS custom properties (`--cxc-*`). To match a client's brand identity you only
override these variables — **no component or code changes**. Nothing visual is
hardcoded: chart series read `--cxc-chart-*`, all text/surfaces read the color
tokens, and typography reads `--cxc-font-*`.

## How to apply a theme

1. Import the library stylesheet once (it ships the default tokens + base styles):

   ```ts
   import '@cypherx/chat-ui/styles.css'
   ```

2. Override any tokens under your own scope (`:root`, a wrapper class, or
   `[data-theme]`). Example — brand the whole renderer:

   ```css
   :root {
     /* Brand */
     --cxc-accent: #4f46e5;          /* buttons, links, active states */
     --cxc-accent-hover: #4338ca;

     /* Typography — point at the client's brand fonts */
     --cxc-font-sans: 'Brand Sans', system-ui, sans-serif;
     --cxc-font-mono: 'Brand Mono', ui-monospace, monospace;
     --cxc-letter-spacing: 0;

     /* Shape */
     --cxc-radius-sm: 6px;
     --cxc-radius-md: 8px;
     --cxc-radius-lg: 10px;

     /* Chart palette — series 1..8 (brand the data viz) */
     --cxc-chart-1: #4f46e5;
     --cxc-chart-2: #06b6d4;
     --cxc-chart-3: #f59e0b;
     --cxc-chart-4: #10b981;
     --cxc-chart-5: #ef4444;
     --cxc-chart-6: #8b5cf6;
     --cxc-chart-7: #ec4899;
     --cxc-chart-8: #14b8a6;
   }
   ```

3. Dark mode: the library ships a dark token set under `.dark` /
   `[data-theme="dark"]`. Add that class/attribute on an ancestor to switch, or
   override the dark values the same way.

   **The chart palette is one of those sets.** `:root` and `.dark` each define
   their own `--cxc-chart-1..8`, measured against their own surface. If you
   override the chart palette in `:root` only, your light hexes leak into dark
   mode — see the validation note below.

## Token reference

### Surfaces & borders
`--cxc-bg`, `--cxc-bg-subtle`, `--cxc-bg-muted`, `--cxc-bg-overlay`,
`--cxc-border`, `--cxc-border-subtle`, `--cxc-border-focus`

### Text
`--cxc-text`, `--cxc-text-secondary`, `--cxc-text-muted`, `--cxc-text-inverse`

### Brand / accent
`--cxc-accent`, `--cxc-accent-hover`, `--cxc-accent-light`

### Semantic
`--cxc-success`(+`-light`), `--cxc-warning`(+`-light`), `--cxc-error`(+`-light`)
— also used by metric deltas (up/down) and the delete affordance.

### Messages, input, sidebar, code
`--cxc-user-bg`/`-text`, `--cxc-assistant-bg`/`-text`,
`--cxc-input-bg`/`-border`/`-focus`,
`--cxc-sidebar-bg`/`-hover`/`-active`,
`--cxc-code-bg`/`-text`/`-header-bg`/`-header-text`

### Typography
`--cxc-font-sans`, `--cxc-font-mono`, `--cxc-font-serif`, `--cxc-letter-spacing`
(charts inherit `--cxc-font-sans` automatically.)

### Shape & depth
`--cxc-radius-sm|md|lg|xl|full`, `--cxc-shadow-sm|md|lg|input`

### Chart palette (AUI charts)
`--cxc-chart-1` … `--cxc-chart-8` — series colors for bar/line/area/pie/scatter/
box plot. Wraps if a chart has more than 8 series. Defined **twice**: once under
`:root` for the light surface and once under `.dark` for the dark surface. The
light values also ship as code-level fallbacks, so charts still render if the
stylesheet isn't loaded.

> **Validate a palette you override.** A brand palette is chosen to look right
> on a brand page, not to be read as data on a chart surface, and the two are
> different jobs. Overriding these tokens bypasses every measurement the
> defaults were picked for, so check your values against:
>
> 1. **Contrast — each slot vs. the surface it paints on.** WCAG 1.4.11 puts the
>    bar for a non-text graphical object at **3:1**. Measure light slots against
>    `--cxc-bg` in `:root` and dark slots against `--cxc-bg` in `.dark`; a hue
>    that clears 3:1 on white is often invisible on near-black and the reverse.
>    This is exactly why there are two sets.
> 2. **Colour-vision deficiency — each adjacent pair.** Roughly 1 in 12 men has
>    some form of it. Simulate protanopia and deuteranopia and check that
>    neighbouring slots stay apart; mid-green and mid-red are the classic pair
>    that merges into one colour. Separating a converging pair in **lightness**
>    fixes it without changing either hue.
>
> Slot order is meaningful — series *N* always takes slot *N* — so a palette must
> work pairwise from slot 1 outward, not merely as a set.
>
> The renderers never rely on hue alone: every chart carries axis labels, a
> legend and a tooltip, and the box plot draws its median in the text token
> rather than the series colour. Your palette should hold that line too.

### Layout & motion
`--cxc-sidebar-width`, `--cxc-content-max-width`,
`--cxc-shimmer-from|via|to`, `--cxc-thinking-color`, `--cxc-ease-accordion`

## Notes
- **One source of truth.** Override tokens; don't fork components. A token set
  fully re-skins both the chat shell *and* the agentic-UI surfaces (KPI cards,
  charts, tables).
- **Charts are token-driven**, including dark mode and fonts — set
  `--cxc-chart-*` and they rebrand everywhere. Set them under **both** `:root`
  and `.dark`, and validate each set against its own surface.
- **Light/dark** resolve automatically because every value is a token reference
  evaluated against the active theme at paint time.
