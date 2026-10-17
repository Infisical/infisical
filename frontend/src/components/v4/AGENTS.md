# v4

This folder is the Infisical 2.0 component source of truth. It is incubating. Product code must not import it. The only allowed importer outside this folder is `src/pages/design-system`.

- Primitives are the shadcn Radix set (`radix-nova`), restyled by `v4.css`. Do not add Base UI or React Aria copies.
- Colors, type, spacing, size, radius, shadow, and opacity come from `tokens.json`. Square corners are the default (`--corners: 0`). Do not hard-code hex, raw Tailwind palette classes, or a fixed radius.
- The docs chrome matches the shadcn docs layout (header, 288px sidebar, 640px article, preview frame). Brand tokens override their type, color, and radius.
- Orgs have no avatar.
- After UI edits, run `npm run lint` in `frontend/`. Also run `npm run lint:v4`. That command is `@shadcn/lint` (`no-raw-colors`, `no-restyle`) on the docs route. It is not part of `npm run lint`, because loading it there blows the 15 minute CI lint cap. Do not add spacing or type classes to a v4 component. Wrap it instead.
- Add components with `npx shadcn@latest add <name> -y` from `frontend/`, which reads `components.json`. Do not run `shadcn init` here. It would retarget the app. The CLI resolves aliases from the root `tsconfig.json`, which is a solution file and must not gain a `paths` block: that slows the frontend lint past its 15 minute CI cap. If add cannot resolve `@app/*`, copy the `paths` block from `tsconfig.app.json` for that command only, and do not commit it.
- Primitives import `cn` from `@app/components/v4/lib/utils`. If `shadcn add` writes `import { cn } from "cn"`, point it at the local helper.
- `theme.css` exposes the tokens as v4-prefixed Tailwind utilities (`bg-v4-ink`, `rounded-v4-control`, `shadow-v4-pop`, `p-v4-12`, `h-v4-control-md`, `text-v4-title`, `hover:bg-v4-hover`). Their values live in `v4.css` under `.v4` (and on `body` while a `.v4` subtree is mounted, so Radix portals get them), so they resolve only on v4 pages.
- These registry items need React 19 and are not installed yet: attachment, bubble, code-block, direction, marker, message, message-scroller, questionnaire, trace.
