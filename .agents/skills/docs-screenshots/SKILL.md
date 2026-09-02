---
name: docs-screenshots
description: Recapture documentation screenshots at retina resolution from the shared self-hosted Infisical instance. Use when docs images are stale, when a UI change invalidates existing screenshots, or when adding a screenshot to a docs page.
---

# Recapturing docs screenshots

Docs screenshots come from a long-lived self-hosted instance on DigitalOcean that is already
populated with synthetic "Example Corp" data. Do not stand up a fresh instance. An empty one
produces screenshots full of empty states, and the seeded projects, folders, secrets, and
machine identities are what make these images look like real usage.

## The instance

```bash
ssh infisicaldo                                        # alias, if configured
ssh -i ~/.ssh/digitalocean_ed25519 root@143.198.182.42  # otherwise
```

The alias lives in the operator's `~/.ssh/config` and will not exist on a fresh machine. The
private key is not in this repo. If neither works, ask the operator rather than provisioning
anything.

The stack is Docker Compose in `/root/infisical`:

```bash
cd /root/infisical
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend --tail 50
```

Containers restart on boot, so the instance survives a reboot. Database backups are in
`/root/infisical/backups/`.

What it holds: org **Example Corp**, four secret-manager projects (Web Platform, Payments API,
Data Pipeline, Internal Tools), each with dev/staging/prod, 33 folders, ~198 secrets with
realistic keys, and four machine identities with scoped project roles.

It also holds **orders-service**, a secret-manager project kept deliberately empty, because the
four seeded projects all have secrets and so none of them can show an empty state. Leave it
empty: fill forms in it and never submit, so the next person still gets the empty screen.

**Do not reset the database.** Wiping the Postgres volume destroys the seeded data and logs out
every session, because each authenticated request revalidates against its `auth_token_sessions`
row. If a reset is genuinely unavoidable, `pg_dump` first, and note that
`POST /api/v1/admin/bootstrap` only works on an instance with no admin yet.

Web UI: `http://143.198.182.42`. Sign in as `dana.park@example.com`. Ask the operator for the
password and pass it as `INFISICAL_PASSWORD`; it is deliberately not committed, since this repo
is public and the instance is reachable from the internet.

## Capturing

Use Playwright, not the Claude-in-Chrome extension. The extension returns 1456x830 JPEG, which
is a large quality regression against images that ship at 2x PNG.

`scripts/capture.mjs` is a library plus a CLI. It holds no list of screenshots and no code
about any individual one, on purpose: there are around 1800 images referenced in the docs, so
anything specific to one of them belongs in the command you run, never in the harness. Copy it
to a scratch directory (not into `e2e/`, which has its own Playwright setup) and
`npm install playwright`.

Write the capture straight to its path under `docs/`, so re-capturing shows up as a plain
`git diff` and there is no copy step to get wrong. Most docs images are a page at rest, which
needs no code at all:

```bash
export INFISICAL_PASSWORD=...        # ask the operator
node capture.mjs docs/images/platform/identities/identities-org.png \
  "/organizations/{org}/access-management?selectedTab=identities" \
  --expect "Machine Identities"
```

`{org}` and `{base}` expand, so a command never carries a raw UUID. `--click LABEL` and
`--expect TEXT` both repeat, which covers a page plus a button or two. It reads
`INFISICAL_URL`, `INFISICAL_EMAIL`, and `INFISICAL_ORG_ID`, each defaulting to the shared
instance.

### Capturing an interactive screen

Anything past a click or two is a throwaway script that imports the helpers. Do not add it to
the harness afterwards:

```js
import { open, go, click, fill, choose, upload, shoot } from "./capture.mjs";

const { browser, page } = await open();
try {
  await go(page, `/organizations/{org}/projects/secret-management/${PROJECT}/overview`);
  await upload(page, { name: "orders.env", contents: "DB_HOST=orders-db.internal\n..." });
  await choose(page, "Target Environments", "Development");
  await shoot(page, "docs/.../review-secrets.png", { expect: ["Review & Upload Secrets"] });
} finally {
  await browser.close();
}
```

`go` navigates, clears the join prompt, and settles. `click` and `fill` work from the visible
label. `choose` picks a dropdown option. `upload` hands a file to a drop zone. `shoot` checks
`expect`, captures, and enforces the size. Every one of them throws instead of continuing
quietly, because an action that silently does nothing yields a valid screenshot of the wrong
state.

Four settings are not optional:

```js
chromium.launch({ headless: true, channel: "chrome" })  // bundled Chromium is not installed
browser.newContext({
  viewport: { width: 1706, height: 971 },               // x2 = 3412x1942, the house size
  deviceScaleFactor: 2,
  colorScheme: "dark",
})
```

Every image ships at 3412x1942, so there is nothing to match against the image you are
replacing. Some older screenshots are 3456x2160 (viewport 1728x1080) and some early ones were
hand-cropped to assorted sizes. Both are legacy, and both get re-captured at 3412x1942 like
everything else. Never change `VIEWPORT` to preserve an old size: converging on one resolution
is the point, and an image that keeps its old dimensions is the thing this rule exists to stop.

To confirm what you installed:

```bash
sips -g pixelWidth -g pixelHeight docs/images/<path>.png
```

### Always capture the full viewport

Every screenshot is a full viewport frame. Never pass `clip` or `fullPage` to
`page.screenshot()`, and never crop afterwards.

This holds **even when the image you are replacing is itself cropped**. A crop cannot be reproduced consistently by the next person. It strips the surrounding UI a reader uses to find the thing being described, and at docs render width a narrow strip is scaled up until it looks broken. Replace a cropped image with a full frame and let the page layout handle the rest.

`capture.mjs` enforces this: after each screenshot it reads the PNG header, and if the image is
not exactly viewport x deviceScaleFactor it deletes the file and fails the shot. The run exits
non-zero if any shot failed. If you are capturing outside this harness, apply the same rule
yourself.

### Gotchas that will waste your time

**Log in on every run.** Do not reuse Playwright `storageState`. The saved session expires
quickly, and a stale one silently lands on the login page instead of erroring, so you capture a
screenshot of the login form and do not notice.

**Dismiss the instance banners.** "Your connection to this Infisical instance is not secured via
HTTPS" and "SMTP has not been configured" are artifacts of this box, not product UI. They render
on the org overview. `clean()` in `capture.mjs` dismisses them.

**Join the project first.** Projects created by the bootstrap machine identity have no human
member, so project pages show "Join Project as Admin" instead of the real UI. Select it once per
project. This is already done for the four seeded projects, but applies to any new one.

**Wait for the login toast to clear** before capturing, or "Successfully logged in" appears in
the corner.

**A passing size is not a passing screen.** The size assertion catches a crop and nothing else.
Every capture should assert some text that is unique to the screen you meant to reach, via
`--expect` or `shoot`'s `expect`. Without it, the failures below all produce a valid PNG of the
wrong thing and report success.

**Escape closes the dialog, not the dropdown inside it.** Use `closeMenu`, which blurs onto the
dialog's own title. This is the single easiest way to capture the page behind a modal and not
notice.

**There are two unrelated dropdown families and they share no selectors.** Radix exposes
`[role="combobox"]` with `[role="option"]` items. react-select has no ARIA roles at all: its
trigger is a `css-*-container` div and its options are portalled out of the dialog with
`react-select-N-option-M` ids. `choose` tries both, so prefer it over hand-written selectors.

**Dialogs repeat a field's label in their own subtitle.** Matching label text anywhere lands on
a paragraph, and the click that follows does nothing at all. `fill` and `choose` walk from the
`<label>` down to a real control instead; do the same if you write a selector by hand.

**Drive `input[type="file"]` directly** for a drop zone rather than synthesising a drag. These
zones also accept a browse click, so the input is always there. `upload` does this.

**A disabled primary button usually means an unmet field, and a missing docs step.** If you had
to fill something before the main action lit up, capture the ready state, then check whether the
prose tells the reader to do that. This is where stale instructions hide.

### Verify every image by eye

Read each PNG back before installing it. Selector drift produces a valid screenshot of the
wrong screen, and that failure is invisible in the script's output.

## What the free tier cannot capture

The instance has no license. `GET /api/v1/organizations/:orgId/plan` returns `samlSSO`, `scim`,
`dynamicSecret`, `groups`, and `rbac` all false. Screens behind those flags cannot be captured
at all, so SAML, SCIM, and dynamic secrets screenshots need a license applied first. Identity
OIDC auth is available; its only plan check guards IP allowlisting.

Check before promising a screenshot:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://143.198.182.42/api/v1/organizations/<orgId>/plan | python3 -m json.tool
```

## Installing and the prose pass

Capture to the image's existing path so the filename never changes and the `.mdx` references
keep resolving. Confirm the image an `.mdx` actually points at before you overwrite it: names
repeat across directories, so `add-connection.png` alone is three different files.

**A stale screenshot usually means stale prose around it.** Retaking an image without reading
the surrounding steps leaves instructions that name buttons and navigation paths that no longer
exist, which is worse than an old screenshot because the reader follows it and gets stuck. Read
the steps on every page that references the image, then use the `docs-style` skill for the
rewrite.

When fixing a repeated instruction across many pages, exact-string replacement is the safe tool,
but **the same sentence exists in more than one form**. Some pages escape the separator as JSX,
`Access Control {'>'} Machine Identities`, and a match on the bare `>` version silently skips
them. Sweep for every form afterwards and confirm the count reaches zero:

```bash
grep -rn "Project Settings.*Access Control" --include='*.mdx' docs/
grep -rn "Access Control {'>'}" --include='*.mdx' docs/
```

Never guess a label you have not seen. If a screen is license-gated and you cannot open it,
report it instead of inventing the button name.

Finish with `make lint-docs-branch` from the repo root. It exits non-zero only on errors, so read
the warnings too: `Infisical.UIActions` (click where the guide wants select) and
`Infisical.Contractions` never affect the exit code.
