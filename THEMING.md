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
`--cxc-chart-1` … `--cxc-chart-8` — series colors for bar/line/area/pie/scatter.
Wraps if a chart has more than 8 series. (Defaults also ship as code-level
fallbacks so charts still render if the stylesheet isn't loaded.)

### Layout & motion
`--cxc-sidebar-width`, `--cxc-content-max-width`,
`--cxc-shimmer-from|via|to`, `--cxc-thinking-color`, `--cxc-ease-accordion`

## Notes
- **One source of truth.** Override tokens; don't fork components. A token set
  fully re-skins both the chat shell *and* the agentic-UI surfaces (KPI cards,
  charts, tables).
- **Charts are token-driven**, including dark mode and fonts — set
  `--cxc-chart-*` and they rebrand everywhere.
- **Light/dark** resolve automatically because every value is a token reference
  evaluated against the active theme at paint time.
