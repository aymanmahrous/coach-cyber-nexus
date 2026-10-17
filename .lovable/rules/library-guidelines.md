# Coach Ayman's Command Center — Guidelines

## Components

The design system exports these components — import them from `@ws-fazkk1v2rsar4rjz1fjw/d5ce83de-4d5c-4f7a-94e8-b5df6a443464` and compose them before building anything from scratch:

`BrandedPosterStudio`, `ContentFactory`, `MediaVault`, `WhatsAppHub`

Per-component details (import stanzas, props, variants, examples) live in `.lovable/rules/libraries/{slug}/components.md` — on disk, not auto-loaded. Read that file or the component source when the name alone isn't enough.

## Theme Files

The design system's theme is delivered through the following files. The author's original source files carry the full wiring the design system needs — variable declarations, framework-specific directives, provider objects, etc. — and are the canonical import target.

- `@ws-fazkk1v2rsar4rjz1fjw/d5ce83de-4d5c-4f7a-94e8-b5df6a443464/styles.css` (source — preferred import)
- `@ws-fazkk1v2rsar4rjz1fjw/d5ce83de-4d5c-4f7a-94e8-b5df6a443464/dist/tokens.css` (auto-generated flat list of CSS custom properties — a raw-values fallback only; does NOT carry framework-specific wiring that the source files above provide)

