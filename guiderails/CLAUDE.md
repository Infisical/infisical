# CLAUDE.md

Guidance for Claude Code sessions working in `guiderails/`.

## What this directory is

An agent-driven documentation checker. It walks a procedural guide from `docs/` against a live
self-hosted Infisical instance the way a reader would, and reports where the guide and the app
disagree, including which of the two is wrong.

**Not** the same as `e2e/`, which is a Playwright smoke suite against deployed gamma that gates
prod promotion. That suite tests the product; this one tests the documentation. `e2e/` failing
means don't ship. Guiderails failing means a guide is probably stale.

## The determinism ladder

The design question is "how do you get a repeatable check out of natural-language prose". The
answer is to push determinism as far down as it goes and spend the model only where judgement is
genuinely needed.

| Layer | Module | Deterministic? | Runs when |
|---|---|---|---|
| L1 extract | `src/extract/` | fully, pure code | every run |
| L2 compile | `src/compile/` | pinned artifact, hash-gated | only when the MDX changes |
| L3 replay | `src/run/replay.ts` | fully, no model | every run, first |
| L4 agent | `src/run/agent.ts` | bounded judgement | only when replay fails |
| L5 judge | `src/verify/judge.ts` | bounded, citation-gated | changed or suspect steps only |
| L5 anchor | `src/verify/anchor.ts` | verified against the diff | stale-docs findings, in CI only |

**The recorded-replay idea is load-bearing.** The agent is a compiler from prose to selectors, run
once, not a runtime. After a walk, the locators it resolved are written to `resolved/` and later
runs replay them with no model involved. The agent re-enters only when replay breaks, which is
exactly when the interesting question changes from "what do I click" to "what changed and whose
fault is it".

Two properties of the recording matter, and both were bugs before they were features:

- **It records the contiguous passing prefix of each procedure, not all-or-nothing.** Requiring a
  fully green walk meant a seven-step guide with one broken step recorded none of its six working
  ones and stayed on the expensive path forever. Measured on `additional-privileges`: 20 model
  calls on the recording run, 4 on the replay run, identical verdicts.
- **It stores fixture placeholders, not resolved values.** A locator captured as
  `guiderails-subject-868a0d62` can only ever match the run that produced it, because the next
  fixture generates a different name. `parameterizeLocators` substitutes values back to
  placeholders on write and `resolveLocators` puts the current run's values back on replay.

## Model choice

Set per task in `src/llm.ts`, not globally, because the four call sites have different demands.
Sonnet 5 for compile, navigate and screenshot; Opus 5 only for blame classification, which is one
call per finding and the judgment the whole report rests on.

Navigation on Sonnet 5 was measured against Opus 5 on `additional-privileges` with the same
compiled plan: identical outcomes (3 passed, 1 failed, 3 unverified), the same finding with the
same reasoning, 20 calls instead of 22, roughly a third of the cost. Opus is not obviously
earning its price on a task that reads an accessibility tree and matches one label.

Override per run without editing code: `GUIDERAILS_MODEL_NAVIGATE=claude-opus-5 ...`, likewise
`_COMPILE`, `_SCREENSHOT`, `_BLAME`.

## Known coverage hole: label drift is under-reported

The agent is asked to navigate *and* report label mismatches in the same step. When it can find a
control despite the guide naming it wrong, navigation succeeds and the mismatch is absorbed
rather than filed. The one real docs bug this tool has found so far ("Access Controls" vs
"Access Control") is currently reported by neither model for exactly that reason.

The fix is not prompt tuning. The compiled plan already lists every label the guide claims and a
snapshot already lists every label the app has, so comparing them is a deterministic string
check that belongs in code before the agent runs. Same lesson as the screenshot actions: do not
ask a model for what the parser already knows.

## Commands

```
npx tsx src/cli.ts lint-images [guide...]   # offline; local image refs resolve
npx tsx src/cli.ts extract <guide>...       # offline; inspect what L1 sees
npx tsx src/cli.ts check-drift [guide...]   # offline; fail if a committed plan is stale
npx tsx src/cli.ts select --all             # offline; which guides a change selects
npx tsx src/cli.ts env up                   # start + bootstrap the instance under test
npx tsx src/cli.ts env fixture <name>       # build one fixture, print what it made
npx tsx src/cli.ts compile [guide...]       # L2, needs Claude credentials
npx tsx src/cli.ts run [guide...] --live    # L3/L4/L5, needs credentials + an instance
npx tsx src/cli.ts live [recording]         # offline; replay a recorded run into the dashboard
```

`lint-images`, `extract`, `check-drift` and `select` are fully offline. Everything else needs
either Docker or Claude credentials, and says so rather than failing obscurely.

**Guide arguments.** Every `[guide...]` accepts a substring, so `folder` finds
`docs/documentation/platform/folder.mdx`. Naming none means all of them, which is what CI does.
Two resolvers back this, and the difference matters:

- `compile`, `check-drift` and `run` resolve against the **registry**, because a plan or a walk
  only means something for a registered guide.
- `lint-images` and `extract` resolve against **all of docs/** via `resolveGuidePath`, because
  linting or inspecting an unregistered page is a reasonable thing to want.

Both refuse an ambiguous name and list the matches rather than guessing, since quietly operating
on a different page than the one asked for is worse than refusing. `resolveGuidePath` prefers an
exact filename match first, so `folder` does not trip over `folder-structure.mdx`.

Argument parsing goes through `src/args.ts`, which knows which flags take a value. The ad-hoc
filtering it replaced assumed anything following a `--flag` was that flag's value, so
`run --live folder` discarded `folder` and silently walked the entire registry. Failing by doing
*more* than asked is the worst shape of that bug, because the output looks fine.

## The live dashboard

`run --live` serves a React app at `http://localhost:4488` (`GUIDERAILS_LIVE_PORT` to move it). The
browser screencast takes the left, and a rail on the right lists the whole plan grouped by
procedure, expanding the current step to show the agent's thinking, tool calls and findings.

It is a consumer of the same event stream the terminal reporter reads, never a second source of
truth, so it cannot show an audience something the log does not contain. A client that connects
mid-run gets the buffered history replayed first, so a reload during a demo restores the whole view.

**The build is lazy and content-hashed.** The app lives in `dashboard/` and nothing built is
committed. `startLiveServer` hashes the dashboard sources plus `src/live/protocol.ts`, compares
against a stamp in `dashboard/dist/`, and calls Vite only on a mismatch. So `--live` works straight
after `npm ci`, and no install or CI step has to know the dashboard exists. If the build fails the
run prints why and continues with the console reporter: a walk costs API calls and a live instance,
and losing one because the UI would not compile is not a trade worth making.

**Iterating on it needs no instance and no API spend.** Record one real walk, then replay it as
often as the UI takes:

```
GUIDERAILS_LIVE_RECORD=reports/last-run.jsonl npx tsx src/cli.ts run folder --live
npx tsx src/cli.ts live                      # replays reports/last-run.jsonl, no Docker needed
npx tsx src/cli.ts live --speed 8 --loop     # or --instant to jump to the finished state
```

The recording is JSONL, one `{ t, event }` per line, `t` being milliseconds from the first event.
The offsets are the point: a page that paints 400 events at once cannot show whether the in-flight
tool state ever renders. Frames are included, so a recording runs to about 10MB a minute — it lands
in `reports/`, which is gitignored.

**Two terminals, for CSS work.** Terminal 1 holds a run or a playback on 4488 (its server keeps
serving after the walk ends). Terminal 2 runs `npm run dashboard:dev`, which serves the app on 4489
and proxies `/events` through to 4488. Edit a `.tsx` and reload; because history is replayed on
connect, a plain reload restores the entire view, which is why there is no React plugin and no Fast
Refresh.

## Non-obvious things about the instance under test

Each of these was found by driving a real browser at a real instance, not by reading handlers.
Any of them silently breaks a run if reintroduced.

- **`POST /api/v1/admin/bootstrap` returns a token that does not work.** It creates its identity
  token with `accessTokenTTL: 0`, so the JWT has no `exp` claim, so
  `fnValidateIdentityAccessTokenFast` treats it as a legacy token and rejects it once now() is
  past `LEGACY_IDENTITY_ACCESS_TOKEN_EXPIRATION_ENFORCED_AT` (default 2026-05-04) plus
  `MAX_MACHINE_IDENTITY_TOKEN_AGE` (default 90d). That cutoff passed on 2026-08-02, so every
  call with it now 401s with "exceeded max age". **This looks like an upstream bug worth
  reporting.** Fixtures use the admin user's JWT instead, which is better anyway: it is the same
  credential a reader holds.

- **Bootstrap does not finish setting up the instance.** `super_admin.onboardingCompleted`
  defaults to false and bootstrap never sets it, so `authenticate.tsx:83` redirects every
  super-admin into the four-step `/admin/setup` wizard. `bootstrapInstance` now closes this with
  `PATCH /api/v1/admin/config`; `env finish-setup` is the repair path for an older instance.

- **Browser pre-authentication is one cookie.** SRP is vestigial (`POST /api/v3/auth/login` is
  plain email and password, and `login2` never verifies the client proof), and there is no
  client-side private key any more, so injecting the org-scoped `jid` cookie is enough. The
  access token lives only in a module closure (`reactQuery.tsx` `MemoryTokenStorage`), so seeding
  localStorage does nothing. `select-organization` is **not** optional: the login token carries
  no `organizationId` and the route guard bounces to the org picker without it.

- **Refresh tokens rotate on use**, so one harvested `jid` seeds exactly one browser context.

- **Frontend routes have pathless layout segments.** The real shape is
  `/organizations/{orgId}/projects/secret-management/{projectId}/overview`; deriving it from the
  `pages/` directory gives a 404.

- **`frontend/` has zero `data-testid` attributes** but 269 `.tsx` files set `aria-label`, which
  is why addressing is by ARIA role and accessible name. Some icon-only controls have no
  accessible name at all, and `folder.mdx` step 1 asks the reader to click one. The tools report
  that honestly rather than guessing positionally.

## Non-obvious things about the docs

`docs/` is messier than `docs/STYLE_GUIDE.md` implies. Each of these is a real case:

- **`<Step title="...">` is usually the instruction**, not a heading. Some steps have a
  screenshot as their entire body.
- **Five nav-path spellings** plus fully unbolded ones. `src/extract/nav.ts` collapses all six.
- **Bold marks the UI target only about half the time** in core-product guides, so its absence
  means "not marked up", never "no target".
- **Field bullets come in two shapes**: separator outside the bold (`**Name** - text`) and colon
  inside it (`**Name:** text`).
- **Snippet imports need recursive inlining**, and provenance must survive it so a suggestion
  lands in the snippet rather than in every page that imports it.
- **Procedures, not files, are the unit.** `secret-sharing.mdx` holds two; `folder.mdx` holds
  three written as running prose with no `<Steps>` at all.

## Invariants worth keeping

- **Every action and every finding carries a verbatim `sourceQuote`.** The compiler drops any
  action whose quote is not present in the step. An unverifiable quote means the model invented
  the action, and a confident false positive posted onto somebody's PR is the worst outcome this
  design can produce.
- **Line numbers are recomputed from the raw file, never trusted from the model.** A wrong line
  puts a suggestion on the wrong row.
- **A `suggestion` block replaces the whole line**, so `renderSuggestions` reads the real line
  and substitutes within it. Emitting the bare replacement phrase would be a one-click way to
  corrupt a guide.
- **Unverifiable is not passing.** A step needing a third-party console is reported `unverified`
  and surfaces in the report; it never counts as verification.
- **The ratchet only advances on a fully green run.** Recording a partial walk would replay a
  broken path and blame the guide for it.
- **Warn-only.** Guides start `critical: false` and earn gating.
- **Prompt caching depends on frozen system prompts.** Interpolating anything per-step into a
  system prompt silently throws the cache away. Per-step content belongs in the user message.
- **`docStepIndex` is never an identity on its own.** It is 1-based *within a procedure*
  (`GuideStep.index`), so folder.mdx has five steps under three distinct indices and secret-sharing
  has eleven under six. Keying on it alone has already caused three bugs: a rail that rendered three
  rows for five steps, a passing step repainted as failed when a later procedure's step 1 overwrote
  it, and a replay that ran one procedure's locators while reporting the failure against another's.
  Always pair it with `procedureIndex`, via `stepKey` from `src/live/protocol.ts` wherever a string
  key is wanted. `entry.skipSteps` in the registry has the same latent ambiguity — every entry is
  `[]` today, and changing a documented field's meaning is a separate decision.

## Which comment goes where, and why

GitHub only accepts a review comment on a line inside the pull request's diff. That single
constraint decides the whole reporting shape:

- **A docs pull request** has the stale docs line in its diff, so the finding becomes a one-click
  ` ```suggestion ` on that line. `renderSuggestions` reads the real line off disk and substitutes
  within it, because a suggestion block replaces the **entire line** and emitting the bare
  corrected phrase would be a one-click way to delete the rest of the sentence.
- **A frontend pull request** does not have the docs line in its diff, so that comment is rejected
  outright. Instead `src/verify/anchor.ts` asks Claude which changed frontend line produces the new
  label, and the warning is attached there, in the file the author is already editing. The docs fix
  travels as a plain fenced diff, not a suggestion block, because a suggestion can only edit the
  file its comment is on.

The anchoring is a model call rather than a text search on purpose: labels come from template
literals, constants files, translation keys and props, so a search silently misses exactly the
cases worth catching. What makes trusting it reasonable is that the answer is checked — the file
must be in the diff, the line must exist, and low-confidence answers are discarded — so a wrong
answer costs a discarded call instead of a comment on unrelated code. Line numbers are computed
from the hunk headers in `parseDiff`, never derived by the model, because off-by-a-few puts the
comment on the wrong line of the right file.

Both paths degrade to the summary comment, which always lists every finding.

## Which image the instance runs

`GUIDERAILS_IMAGE` selects it, defaulting to `infisical/infisical:latest`.

This is not cosmetic. The published image contains whatever was last released, so testing a
frontend change against it would report success while the change under review stayed invisible —
and the drift would then surface on whatever unrelated pull request ran next, blaming the wrong
person. So the workflow builds the standalone image from the ref whenever the pull request touches
`frontend/`, `backend/` or `Dockerfile.standalone-infisical`, and only uses the published image for
a docs-only change.

The build uses Depot, matching the release workflow, because `backend/CLAUDE.md` forbids
`cache-to: type=gha` on image builds: GHA cache is PR-scoped and the repo's 10GB budget is full, so
writing image blobs evicts every other workflow's `node_modules` cache. Depot's cache sits outside
GHA. The built tag is loaded into the local daemon and `GUIDERAILS_PULL_POLICY=never` is set
alongside it — without that, Docker would helpfully replace the freshly built tag with the
published image and silently test the wrong code.

Locally this needs no thought: the default is the published image, and a developer who wants their
own working tree sets the same variable to a locally built tag.

## Adding a guide

1. Write `guides/<name>.yaml`: the guide path, a fixture, `watch` globs, `critical: false`.
2. `npx tsx src/cli.ts extract <guide>` and check L1 saw the steps you expect.
3. `npx tsx src/cli.ts compile <guide>` and **read the generated plan** before committing it.
   That review is the point of committing plans at all.
4. `npx tsx src/cli.ts run <guide> --live` against a local instance.
5. Commit the plan. `check-drift` fails if the guide changes without a recompile.

Prefer guides that need no third-party account. Roughly 179 of the sync and connection guides
need real AWS, GitHub or GCP credentials; test only the Infisical-side steps of those and let
the rest report as unverified.

## Dependencies

No `.npmrc` here, matching `e2e/`: the 7-day minimum-release-age rule in `backend/` and
`frontend/` exists for runtime artifacts, and this is a test harness. CI uses `npm ci`, so a
dependency change must commit the lockfile in the same change.

`vite`, `react` and `react-dom` are devDependencies used only to build the live dashboard. Nothing
shipped depends on them, and nothing in CI builds the dashboard — a missing Vite degrades `--live`
to the console reporter rather than failing a job.
