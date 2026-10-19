# v4

This folder is the Infisical 2.0 component source of truth. It is incubating. Product code must not import it. The only UI importer outside this folder is `src/pages/design-system`. Dedicated generation and introspection scripts may read the typed metadata; product code remains fenced from all v4 imports.

For the contribution workflow, read [Infisical UI](skills/infisical-ui/SKILL.md). Its [canonical rules](skills/infisical-ui/rules.json) also drive the workbench Rules page. Every rule, shared or component, has a `detect` field: `lint` names a check in `frontend/scripts/check-v4.ts`, `test` names the test that exercises it, and `review` means only a reader of the change will catch a break. Generation fails on a rule without one.

- Primitives are the shadcn Radix set (`radix-nova`), restyled by `v4.css`. Do not add a second primitive library.
- Colors, type, radius and motion timing (`--v4-duration-*`, `--v4-ease-*`) come from `tokens.json`. Square corners are canonical (`--corners: 0`). The soft scale is an available mode: `V4Scope corners="soft"` sets `data-corners="soft"`, which turns the multiplier to 1. Always multiply a radius token by `var(--corners)`. Do not hard-code hex, raw Tailwind palette classes, a fixed radius, or a literal duration or easing.
- The workbench uses a sidebar brand header, a wide Human preview article, readable Agent measure and responsive comparison cards, with floating Human/Agent and theme controls. Brand tokens define its type, color and radius.
- Brand neon lime is `--v4-accent`, paired with `--v4-on-accent`. The shadcn `bg-accent` role is neutral selection/hover, not brand lime. Primary (and default, its alias) Buttons are the ink fill for the one main action; only accent Buttons use the shared lime material, for approval and grant moments. Keep the global primary role ink and selection neutral. Follow rule/button-material in the canonical rules; do not repaint Buttons in examples.
- Use `V4Scope` for the docs boundary and portal container. Use the existing ThemeProvider for theme changes.
- Orgs have no avatar.
- After UI edits, run `npm run lint` in `frontend/`. Also run `npm run lint:v4` and `npm run ui:lint`. `ui:lint` runs the v4 checks against a baseline that only shrinks: a new finding fails, a fixed one is locked in with `npm run ui:lint -- --update`. Exempt one line with `v4-check-ignore <check> -- <reason>` on it or the line above; the reason is required. `lint:v4` is `@shadcn/lint` (`no-raw-colors`, `no-restyle`) on the docs route. It is not part of `npm run lint`, because loading it there blows the 15 minute CI lint cap. Do not add spacing or type classes to a v4 component. Wrap it instead.
- Add components with `npx shadcn@4.22.0 add <name> -y` from `frontend/`, which reads `components.json`. Do not run `shadcn init` here. It would retarget the app. The CLI resolves aliases from the root `tsconfig.json`, which is a solution file and must not gain a `paths` block: that slows the frontend lint past its 15 minute CI cap. If add cannot resolve `@app/*`, copy the `paths` block from `tsconfig.app.json` for that command only, and do not commit it.
- Primitives import `cn` from the `cn` package. That is the registry's helper. Do not rewrite those imports.
- These unrelated upstream items remain outside this React 18 foundation: attachment, bubble, direction, marker, message, message-scroller, questionnaire, trace.

Read the generated component guides in [docs/README.md](docs/README.md) or run `npm run ui:info -- <name>` from frontend. `npm run ui:generate` refreshes tokens, the catalog, documentation and standard registry payloads; `npm run ui:check` detects stale output and missing contracts. Start `npm run ui:dev` for the backend-free workbench. Verification recipes in metadata are not passing evidence.

## Human examples

Use the shared preview frame and ExampleGrid, ExampleCell and ExampleStage presentation components. Compare supported variants, distinct sizes and applicable states as labeled peers. Captions sit 8px below their own specimen and describe its actual state. Specimens and captions align to the start, and specimens in a row share a bottom baseline, so the captions of a row line up. Equal-appearance aliases share one specimen. Keep specimens in one row of similar height; give a much taller one its own row.

Use only the composition needed to demonstrate the component. Do not add synthetic save/reject/reset controls, request logs, export workflows or stress-test toolbars to Human pages. Ordinary action buttons do not become pressed toggles merely to produce feedback. Keep core interactions working and relevant states visible. Put technical orchestration in component tests and explain constraints in the closed Usage and rules disclosure. Generated Agent examples lower documentation-only presentation wrappers to native layout elements, so they remain portable.

## Icons

Lucide (`lucide-react`) is the icon source of truth for v4. Use `Icon` (52 product names mapped to Lucide, or any Lucide icon through `icon`) or import Lucide directly. `assets/icons-legacy/` holds the original Infisical 2.0 line set from #8691 for reference only: nothing imports it and the registry does not ship it. Do not hand-draw SVG icons.
