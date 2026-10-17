---
name: infisical-ui
description: Use when building Infisical UI against the v4 design system. Covers tokens, the fenced component folder, and the shadcn registry workflow.
---

# Infisical UI

v4 is the Infisical 2.0 component source of truth. It is incubating. Product code must not import `@app/components/v4`.

- Add a primitive with `npx shadcn@latest add <name> -y` from `frontend/`. `components.json` already points at `src/components/v4` and the Radix Nova style. Do not run `shadcn init`.
- Restyle with `tokens.json` and `v4.css`. Do not hard-code hex, palette classes, or a fixed radius. Square corners are the default (`--corners: 0`).
- The docs chrome is `/design-system`. Match its layout (56/64px header, 288px sidebar, 640px article, preview frame). Brand tokens override shadcn type, color, and radius.
- Orgs have no avatar.
- After UI edits, run `npm run lint` in `frontend/` and fix errors in files you touched.
- The official shadcn MCP server reads this registry once `registry.json` is built and hosted. Do not fork the MCP server.
