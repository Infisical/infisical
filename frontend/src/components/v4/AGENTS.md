# v4

This folder is the Infisical 2.0 component source of truth. It is incubating. Product code must not import it. The only allowed importer outside this folder is `src/pages/design-system`.

- Primitives are the shadcn Radix set (`radix-nova`), restyled by `v4.css`. Do not add Base UI or React Aria copies.
- Colors, type, and radius come from `tokens.json`. Square corners are the default (`--corners: 0`). Do not hard-code hex, raw Tailwind palette classes, or a fixed radius.
- The docs chrome matches the shadcn docs layout (header, 288px sidebar, 640px article, preview frame). Brand tokens override their type, color, and radius.
- Orgs have no avatar.
- After UI edits, run `npm run lint` in `frontend/` and fix errors. `@shadcn/lint` checks the docs route for raw colors and restyling. Do not add spacing or type classes to a v4 component. Wrap it instead.
- Add components with `npx shadcn@latest add <name> -y` from `frontend/`, which reads `components.json`. Do not run `shadcn init` here. It would retarget the app.
- Primitives import `cn` from the `cn` package. That is the registry's helper. Do not rewrite those imports.
- These registry items need React 19 and are not installed yet: attachment, bubble, code-block, direction, marker, message, message-scroller, questionnaire, trace.
