# v4

This folder is the Infisical 2.0 component source of truth. It is incubating. Product code must not import it. The only allowed importer outside this folder is `src/pages/design-system`.

- Primitives are the shadcn Radix set (`radix-nova`), restyled by `v4.css`. Do not add Base UI or React Aria copies.
- Colors, type, and radius come from `tokens.json`. Square corners are the default (`--corners: 0`). Do not hard-code hex, raw Tailwind palette classes, or a fixed radius.
- The docs chrome matches the shadcn docs layout (header, 288px sidebar, 640px article, preview frame). Brand tokens override their type, color, and radius.
- Orgs have no avatar or icon anywhere.
- Read [`DESIGN.md`](DESIGN.md), the brand book (voice, color, type, shape, spacing, states, motion, iconography and logo), before building UI. Per-component guidelines are in [`docs/`](docs/README.md), each marked implemented, partly implemented or not yet implemented. Icons and logos are in `assets/`.
- When a token changes, update `tokens.json` and `v4.css` together. Nothing generates `v4.css`.
- After UI edits, run `npm run lint` in `frontend/`. Also run `npm run lint:v4`. That command is `@shadcn/lint` (`no-raw-colors`, `no-restyle`) on the docs route. It is not part of `npm run lint`, because loading it there blows the 15 minute CI lint cap. Do not add spacing or type classes to a v4 component. Wrap it instead.
- Add components with `npx shadcn@latest add <name> -y` from `frontend/`, which reads `components.json`. Do not run `shadcn init` here. It would retarget the app. The CLI resolves aliases from the root `tsconfig.json`, which is a solution file and must not gain a `paths` block: that slows the frontend lint past its 15 minute CI cap. If add cannot resolve `@app/*`, copy the `paths` block from `tsconfig.app.json` for that command only, and do not commit it.
- Primitives import `cn` from the `cn` package. That is the registry's helper. Do not rewrite those imports.
- These registry items need React 19 and are not installed yet: attachment, bubble, code-block, direction, marker, message, message-scroller, questionnaire, trace.
