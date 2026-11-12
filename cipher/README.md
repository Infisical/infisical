# Cipher

Cipher is Infisical's design system: a set of React components, tokens and themes published as a public [shadcn registry](https://ui.shadcn.com/docs/registry). Install its items into any React project and own the code, the same way you add shadcn/ui components.

The source lives in [frontend/src/components/v4](../frontend/src/components/v4). This folder holds the released registry payloads in [r/](r/), served straight from GitHub.

## Requirements

- React 19 and TypeScript
- Tailwind CSS v4
- A project set up with `npx shadcn@latest init`

## Install

Register the `@cipher` namespace once, then add items by name:

```bash
$ npx shadcn@latest registry add "@cipher=https://raw.githubusercontent.com/Infisical/infisical/<ref>/cipher/r/{name}.json"
$ npx shadcn@latest add @cipher/cipher-base @cipher/button @cipher/dialog
```

Replace `<ref>` with a tag or commit SHA to pin a release, or a branch name to follow it. Every item depends on `@cipher/cipher-base`, which the CLI installs for you. To see what's available, run `npx shadcn@latest search @cipher`.

Files land under `src/components/v4/` and import each other by relative path, so they don't depend on your import aliases.

Import the stylesheet once, after your Tailwind entry, and wrap Cipher UI in `V4Scope`:

```tsx
import "./index.css";
import "./components/v4/v4.css";

import { V4Scope } from "./components/v4/scope";
import { Toaster } from "./components/v4/ui/sonner";

export function App() {
  return (
    <V4Scope theme="peach" className="min-h-screen bg-background text-foreground">
      {/* your app */}
      <Toaster />
    </V4Scope>
  );
}
```

## Themes

`V4Scope` takes a theme id. Lightly Peach (`peach`) is the default light theme, Light is `pale` and Dark is `dark`. `dark-alt` also ships. Overlays and toasts portal into the scope, so they follow its theme.

## Docs for people and agents

`@cipher/cipher-docs` installs the usage rules, a guide per component and the agent skill under `src/components/v4/`. Add it if you build with a coding agent.

## Update

Point the `@cipher` URL in `components.json` at the new ref, then review and apply the changes:

```bash
$ npx shadcn@latest add @cipher/button --diff
$ npx shadcn@latest add @cipher/cipher-base @cipher/button --overwrite
```

`--overwrite` replaces your local copies, so commit or stash local edits first.

## Not in the registry

These items depend on the Infisical app and stay out of Cipher:

- `app-connection-form`: builds Infisical App Connection forms from presets, schemas and a redirect flow that live in the app.
- `provider-icon`: loads integration logos from the Infisical app's static assets.

## Release

From `frontend/`, run `npm run cipher:release`. It regenerates the registry and copies the payloads into `cipher/r/`. Commit the result, then tag the commit (for example `cipher-v0.1.0`) so consumers can pin it.

## License

Cipher is MIT licensed, like the rest of this repository outside `ee/` directories. See [LICENSE](../LICENSE).

The Archivo and Geist Mono fonts embedded in `v4.css` are licensed under the SIL Open Font License 1.1. Their license texts ship with `@cipher/cipher-base` under `src/components/v4/fonts/`; keep them with the fonts. The Infisical name and logo are trademarks of Infisical Inc. and are not part of the license.
