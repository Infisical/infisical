---
name: docs-style
description: Write, edit, and review Infisical documentation to the house style guide. Use whenever creating or changing any file under docs/ (.mdx pages, snippets, docs.json navigation), when asked to document a feature, write or update a guide, or review a docs diff or pull request. Covers the deterministic Vale lint plus the sentence-level review pass Vale cannot check.
---

# Infisical docs style

`docs/STYLE_GUIDE.md` is the source of truth. Read it before writing. This skill is the
procedure for applying it, not a second copy of the rules.

Two things to know up front:

- `make lint-docs-branch` checks maybe a third of the guide. Everything in section 5 and
  section 11 is a judgment call, and those are the rules AI drafts break by default.
- Vale cannot see prose indented four or more spaces inside a Mintlify component, which is
  roughly half of this repo. A clean run says nothing about a nested page.

## Before you write

Ask the engineer for the facts before drafting. The product knowledge is the part only they
have, and a draft written without it reads plausible and says nothing.

Then use the model where it earns its place. Structure, grouping, ordering, and spotting the
section that is missing are worth delegating. Sentences are not. A page whose outline came
from a model and whose prose came from the engineer beats a fully generated draft every time,
so offer that split rather than assuming a full draft is wanted.

Check every fact against the product, not against other docs pages, which lag behind it:

- **UI steps.** Take button, tab, and field names and the order of screens from the running
  product, or from the frontend source if you can't reach it. Don't copy them from an older
  guide.
- **Behavior claims.** Read the code path before stating what the product does, such as which
  deployments enforce a limit or which responses share a format. If another page seems to
  contradict what you found, work out why before writing either one.

## Writing

Follow `docs/STYLE_GUIDE.md` sections 1 to 4 and 10 for what belongs on the page: context
before mechanics, prerequisites in a `## Prerequisites` heading rather than a callout, the
right component for the shape of the content, and the page structure for its type.

Then run the review pass below over your own draft before handing it over. Every rule in it
applies to a first draft, including yours.

## Reviewing

Work in this order. Structure first, because a rewritten sentence in the wrong section is
wasted work.

**1. Run the linter.** `make lint-docs-branch` from the repository root. It exits non-zero
only on errors, so read the printed warnings and suggestions too. `Infisical.UIActions` and
`Infisical.Contractions` never affect the exit code yet, and they are the two rules most
likely to have something to say.

**2. Check the structure, then leave it alone.** Headings, ordering, and section breaks are
usually sound, in a human draft and a model draft alike. Confirm the page reads top to bottom,
that a reader landing cold is oriented in the first few sentences, and that nothing was
inserted without connecting it to what surrounds it. Then check what the guide's sections 7,
8, and 10 ask of structure:

- Sections on the same topic sit next to each other, and each callout is in the section it applies to
- Every heading makes sense to a reader who doesn't know the topic yet, and no group is called
  "Other"
- Every prerequisite can be checked before the reader starts, asks for the least access that
  works, and links to where to get it

If the outline holds, accept it and move on.

**3. Rewrite the sentences.** This is where the work is. Take `docs/STYLE_GUIDE.md` section 5
and check every sentence against it. In practice these catch the most:

- A concept given a human verb. Nothing says, knows, understands, or wants anything.
- Two sentences making the same point in different words. Keep the one with new information.
- A definition that needs a second clause to explain its first.
- A transitive verb with no object, as in "the agent requests". Read the second half of every
  long sentence on its own; a verb left with nothing to act on is usually a sentence that lost
  its tail in an edit, and it hides a detail nobody settled.
- An abstract construction standing in for a mechanism the writer may not have known.
- A metaphor or figurative verb ("drive a resource", "wire Infisical into your tooling", "the
  rest sit between those two"). Say literally what happens.
- A category where the exact subject belongs ("a resource", "an instance"), or an actor nobody
  can identify ("an admin", "someone").
- A qualifier with nothing named behind it: a default for what? built into what?
- A coined term ("worked example") or a specialist word ("prepend", "ingress") where a common
  one exists.
- A sentence that parses two ways: nouns stacked against the verb, or an opening word that could
  be a noun or a verb ("List endpoints return...").
- An aside to the reader that adds tone and no information ("so you know when to stop"), or the
  reverse, a condition phrased around an abstract noun ("On a self-hosted instance") when
  "If you self-host Infisical" would say it directly.

Then read every sentence out loud. If you would not say it to a colleague standing next to
you, rewrite it. That single test catches most of the rest.

**4. Check the formatting Vale cannot see.** Section 11, none of it machine-checked:

- Bold on a word that is not on screen. `**Note**:`, `**important**`, or a whole bolded
  sentence is emphasis, and the prose should carry it instead. A `**Label:**` opening a list
  item is a label, and fine.
- A button or field name in quotes or a code span rather than bold: `Click 'Submit'`,
  `` Select `SQL Database` ``. Code spans are for code, paths, keystrokes, and literal values.
- A button or field name with no markup at all, which is the case no pattern can find.
- A period at the end of a bullet point.
- "Above" or "below" where a link to the section belongs.
- A method and path written into a sentence (`POST /api/v1/...`) instead of a description
  linked to the endpoint's reference page, or an endpoint mentioned with no link at all.
- A sentence telling the reader they can do something, with no link or steps showing how.

Before you hand a draft back, check it for every pattern you've already been corrected on,
including in this conversation. A correction that comes back a second time is the most
avoidable mistake there is.

**5. Report, then offer to apply.** One finding per line as `path/to/file.mdx:12`, the sentence
as written, and the rewrite. Group them by file. Then ask once before editing, for the whole
set.

Do not silently rewrite an engineer's prose. Their phrasing usually reads more like a person
talking than a replacement would, and the question worth putting to them is whether they would
have written the sentence themselves.

## When Vale is wrong

`docs/CONTRIBUTING.MD` covers adding a word to the vocabulary, enforcing a spelling, and
suppressing a rule in place with `{/* vale Infisical.RuleName = NO */}`. Suppress a rule only
where it is genuinely wrong about a specific line, never to quiet a page.
