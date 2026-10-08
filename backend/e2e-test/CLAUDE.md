# Faking a third-party provider

**Never add test-only code to `src/`** — no test-mode enum members, no lookup map entries, no
`isTestMode` branches. Replace the module instead, from `test.alias` in
`vitest.e2e.config.mts`, with a double under `e2e-test/fakes/`. Production code stays unaware
a fake exists. `e2e-test/fakes/aws-parameter-store-sync-fns.ts` and its connection counterpart
are the worked examples, and the pre-existing `./license-fns` alias is the precedent.

Four things decide whether this works:

- **Alias the narrowest specifier.** Entries match the import string, so aliasing one a single
  file imports (a barrel's `./x-fns` re-export) swaps that seam and leaves the constants,
  schemas, types, router and lookup maps real.
- **`test.alias` must stay an array.** Vite's `mergeAlias` concatenates arrays with
  `test.alias` first, but merges two objects, where the generic `@app` prefix matches before a
  specific `@app/...` entry and the fake silently stops applying with no error.
- **Re-export whatever you do not replace.** The alias swaps the whole module, so an export you
  omit stops existing for every importer of it.
- **Assert the fake still matches.** Nothing otherwise checks it against the module it
  replaces. Export an assignment typed as `Pick<typeof RealModule, …>` so a signature change
  fails type-checking rather than leaving the fake quietly wrong.

A fake must reproduce the contract under test, not merely record its input. The Parameter Store
fake reimplements the real reconciliation rules (skip empty writes, delete absent keys unless
deletion is disabled, respect the key schema), because those rules are the behavior the specs
exist to pin.
