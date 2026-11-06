# AGENTS.md

Guidance for anyone, person or agent, who changes the docs screenshots drawn from this directory. Read
[`README.md`](README.md) for the commands; this file covers the rules and the gotchas.

## What this directory is

The source of the Agent Vault screenshots in `docs/images/platform/agent-vault/`. Each scene in
`scenes/agent-vault/<scene>/` is a `scene.json` (the UI steps and the file name of each shot) and a
`network.har` (the API answers the app got while the scene was recorded). [rerecord](https://www.npmjs.com/package/rerecord)
redraws a scene from the current frontend build with no backend: it answers every API call from the HAR,
runs the steps, and writes each shot to `docs/images/platform/<shot>`.

The `Rerecord docs screenshots` workflow (`.github/workflows/rerecord-docs-screenshots.yml`) redraws every
scene on each pull request that touches `frontend/src` or this directory, and commits the images that changed.

## Rules

- **Change the scene, not the PNG.** Every image in `docs/images/platform/agent-vault/` comes from a scene,
  and the next redraw overwrites a hand-edited PNG. Only other vendors' consoles (the AWS console) are
  committed as plain images, and they live elsewhere under `docs/images/`.
- **Let CI draw the committed images.** The workflow renders in `mcr.microsoft.com/playwright:v1.60.0-noble`,
  and two renders there are byte-identical. A redraw on macOS draws fonts differently and would change every
  image. To match CI locally, run the redraw in that image (see [Verify](#verify)).
- **Keep the demo data.** Every scene shows the fictional org in the README's "Demo data" section: the same
  people, `@example.com` emails, documentation IP ranges, AWS account `123456789012`, and made-up secrets in
  the vendor's format. Don't introduce new names for things that already have one.
- **Never commit a credential or personal detail.** rerecord strips cookies and auth headers and refuses a
  recording that sends a password, but it keeps every answer body as it came back. Before committing,
  search the scene's files for your name, email, IP address, machine paths, and any token that was ever
  issued. Strip request headers from the HAR (keep only `content-type`); replay doesn't use them.
- **Local patches stay local.** Recording some screens needs a patched backend, such as a license with
  every feature on. Never commit those patches (see the root `AGENTS.md`'s workflow guardrails).
- **Every image is used, and every used image exists.** When you add a shot, add it to a docs page with a
  `<Frame><img … alt="…" /></Frame>` and alt text that describes what the image shows. When you drop one,
  delete the PNG.

## How replay works

Knowing this tells you which edits are safe.

- **Matching:** each API request is matched on method, full URL, and body. If the frontend changes a
  request (a new query parameter, a new field in a body), the scene fails and names the request it can't
  answer.
- **Repeated requests:** a request gets its recorded answers in order, then keeps getting the last one. A
  list fetched before and after a save shows both states.
- **Origin:** the app is served at `http://localhost:39999`, and only `/api/` is answered from the HAR.
  Requests to any other origin are aborted.
- **Clock and size:** the clock is frozen at `frozenTime` (so "in 8 hours" stays the same), the timezone is
  UTC, and the 1728x991 viewport at 2x scale gives 3456x1982 images, the size the docs use.
- **Empty browser:** each scene starts with no local storage, so its first steps close the
  **Introducing Agent Vault** dialog. Keep them.

## Making a change

Pick the cheapest edit that does the job:

| Change | Edit |
|---|---|
| Data on screen (a name, a label, a date, an email) | Find and replace in `network.har`, then redraw |
| A renamed button, tab, or field | Update the step's target in `scene.json` |
| A new API call the frontend now makes | Add its answer to `network.har`, or record the scene again |
| A new screen, a new flow, or a state the data doesn't have | Record a new scene, or record this one again |

Editing `network.har`:

- Answer bodies are JSON stored as a string inside the HAR's JSON, so quotes in them are escaped. Replace
  plain substrings (`@acme.dev` → `@example.com`) rather than editing the structure by hand.
- If the value you change also appears in a request URL or body, change it everywhere, including its
  URL-encoded form, or the request stops matching.
- Redraw after every edit; a broken edit fails the scene rather than drawing a wrong image.

Editing `scene.json`:

- Target elements by role and name, label, placeholder, or text (`{ "role": "button", "name": "Save" }`).
  Avoid CSS selectors and positions, which break on the next UI change.
- Put a `waitFor` on content before each shot, so the shot never catches a loading state.
- To shoot a tooltip or hover card, give the shot a `hover` point; rerecord moves the pointer there and
  runs the clock forward so the tooltip opens.
- Shot names are `agent-vault/<image-name>.png`, and the image name is what the docs reference.

## Recording a scene

Record against a local dev instance seeded with the demo data, never against a real organization. The
README has the `rerecord record` steps. Some screens need more than the app:

- **Licensed features** (session logs in a bucket, groups, audit logs) show upgrade prompts on an
  unlicensed instance; record with a local license patch and don't commit it.
- **Session logs** are downloaded by the browser straight from S3, which rerecord doesn't record. The
  `sessions`, `settings` and `variables` scenes were recorded against S3-compatible storage, and each S3
  answer was saved into `network.har` under `http://localhost:39999/api/__object-storage/` with the links in
  the API answers rewritten to match. Recording one of them again needs the same step, or the logs view
  shows its download error.
- **Dialogs that print the page's address** (the **Proxy Token** and **Session Created** dialogs, and the
  OAuth redirect URI) show `http://localhost:39999` on replay, so there's no image of the OAuth form with a
  redirect URI.
- **MCP tool lists** need a real MCP server to answer, so the Tools step is shot with **All Tools** on.

## Verify

```bash
# Redraw the way CI does, so the images match what the workflow would commit
docker run --rm -v "$PWD":/repo -v /repo/frontend/node_modules -v /repo/docs/rerecord/node_modules \
  -w /repo mcr.microsoft.com/playwright:v1.60.0-noble \
  bash -c 'cd frontend && npm ci && cd ../docs/rerecord && npm ci && npx rerecord rerecord'

# Check the docs pages you touched
make lint-docs-branch
```

Run both from the repository root. Then check that each image you added or changed is referenced from a
docs page, look at the images themselves, and search the scene files for anything that shouldn't be
committed.
