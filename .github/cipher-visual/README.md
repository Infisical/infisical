# Cipher visual check (v4 app)

`.github/workflows/cipher-visual.yml` renders fixed v4 demo pages with two Cipher builds and pixel-diffs them. It replaces the hand-run consumer screenshots in the Cipher release procedure.

## When it runs

- **Pin pull requests.** Any pull request into `design/v4-controls-polish` or `main` that changes `frontend/package.json`. The baseline is the `@infisical/cipher` pin on the PR's base branch, and the candidate is the pin in the PR's merge commit (`github:Infisical/cipher#<ref>`, where the ref is a tag, branch or sha). Reading the merge commit means a branch that is behind its base still compares the right way round. When the pin did not change, the check passes in a few seconds without rendering anything.
- **Release cascade.** The Cipher pin bump PR the release opens is a pin pull request, so the check runs on it with no extra step. To check an RC, open a draft PR that pins `github:Infisical/cipher#<rc sha>`.
- **Manual.** `workflow_dispatch` with `base`, `candidate` and `scope` (`full` or `scoped`). GitHub only offers dispatch for workflows on the default branch, so this works once v4 is on `main`.
- **Overrides.** `CIPHER_BASE` and `CIPHER_CANDIDATE` at the top of the workflow replace the pins when set. Leave them empty on a merged workflow.

## Scope

A run renders every page by default. Add the `cipher-visual:scoped` label to the PR to render only the pages whose import graph reaches a Cipher module that changed between the two refs. Adding the label starts a new run. `scope.mjs` widens to every page when tokens, global CSS, fonts, themes or frame and overlay primitives change. The v4 shell (command menu, error page) imports `data-table` and `list`, so a change to those still reaches every page.

## Pages

`pages.json` lists each page: its id, its demo URL (org `demo` runs on fixtures with no login), the route files `scope.mjs` walks, the steps that open an overlay, and `mobile: true` for a 390px capture. Desktop shots are 1706x971 at device scale factor 2, Light theme, UTC, en-US, with the clock fixed to 2026-06-15T17:00:00Z and animations off. `stubs` answers `/api/v1/admin/config`, the only API call the boot path needs; every other request is blocked. `ignore` keeps the walk out of `routeTree.gen.ts`, which imports every route.

To add a page, add an entry with its route file and URL, and check it captures with:

```sh
$ cd frontend && npx vite build && npx vite preview --port 4173 &
$ cd .github/cipher-visual && npm ci && node capture.mjs http://127.0.0.1:4173 /tmp/shots
```

## Reading the report

The Diff job writes the summary to the run page: base and candidate shas, the scope, and each changed snapshot with its count of changed pixels. The `cipher-visual-report` artifact holds `summary.md`, `summary.json`, `scope.json` and `changed/<viewport>/<page>.{before,after,diff}.png`; the diff image marks changed pixels in red. The raw shots are in the `cipher-visual-base` and `cipher-visual-candidate` artifacts.

The diff runs at `PIXEL_THRESHOLD: "0"`, so any changed pixel counts. Shots are byte-identical between runs of the same build, so a change is real, but it can be invisible: a few pixels of antialiasing on an icon is a change in the build, not noise. Open the before and after images for every changed page and trace each change to a Cipher PR before calling a release clean.

## Out of scope

The check does not hover, drag, scroll inside overlays or probe overflow, and it renders Light only. Run those checks by hand when a release touches them.
