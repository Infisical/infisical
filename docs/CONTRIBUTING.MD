# Contributing to the documentation

## Style guide

**Read [STYLE_GUIDE.md](./STYLE_GUIDE.md) before writing documentation.** It covers:

- Writing for users (not implementers)
- Cross-referencing related concepts
- Using Mintlify components (`<Steps>`, `<Tabs>`, `<Card>`, etc.)
- Page structure and formatting
- Sentence-level writing rules, and the bolding and UI conventions

## Using the docs-style skill

Vale checks roughly a third of the style guide. The rest needs a reviewer.

The `docs-style` skill in `.claude/skills/docs-style/` is that reviewer. Claude loads it on its
own for any work under `docs/`, or you can invoke it explicitly with `/docs-style`. It runs the linter,
checks the page structure, then goes sentence by sentence and reports each finding as
`file:line` with a rewrite before changing anything.

It's worth running on your own prose too, not only on a draft a model wrote.

## Working from an AI draft

Structure survives a model draft. Sentences do not, and that is where reviewers spend their
time. The order that avoids it:

1. **Brain dump first, in your own words.** Get everything you know onto the page before any
   tool touches it. Write in whichever language is faster for you. The product knowledge is the
   part only you have, and accuracy matters more than phrasing at this stage.
2. **Use the model for structure.** Grouping, ordering, and spotting the section you forgot are
   what it is good at. Ask it for headings and an outline.
3. **Write the prose yourself.** Your own writing with a spell check, or a light review pass,
   usually reads more like a person talking. Before you submit, go through the page and ask:
   would I have written this sentence? Rewrite anywhere the answer is no.

## Linting prose

Parts of the style guide are enforced by [Vale](https://vale.sh). Install it and run the
linter from the repository root:

```
brew install vale
make lint-docs-branch   # only the .mdx files this branch touched
make lint-docs          # every .mdx file in docs/
```

The configuration lives in `docs/.vale.ini` and `docs/.vale/styles/`. The Vale version CI
installs is pinned in `docs/.vale-version`, and both targets warn when the version you have
installed differs. CI verifies the download against the checksums published with that
release. The config pins `.mdx` to the Markdown parser, so behavior is tied to the
version.

Both targets call `docs/scripts/lint-docs.sh`, and so does the `Check docs style` GitHub
workflow, which runs only on pull requests that touch `docs/` and lints the files the pull
request changed. A branch that edits the configuration itself -- `.vale.ini`, a file under
`.vale/styles/`, `.vale-version`, or the script -- is linted in full instead, since a rule
change reaches pages the branch never touched. Local and CI results therefore match. You can
also run `vale <path>` directly on a subset. A run fails only on errors; warnings and
suggestions are printed but do not block.

Mintlify runs its own Vale check against this same config, and its results do not always
agree with ours -- it is a separate build we do not control. `Check docs style` is the check
to go by.

What it checks: sentence case in headings and in the `title`/`sidebarTitle` frontmatter
fields, the enforced spellings in
`docs/.vale/styles/Infisical/Terminology.yml`, spelling against the vocabulary in
`docs/.vale/styles/config/vocabularies/Infisical/`, `$` prompts that break copy-paste,
placeholders like `foo`, em dashes piling up in one paragraph, "click" and "tap" where the
verb should be "select", and the full forms of common contractions.

**`Infisical.UIActions` and `Infisical.Contractions` do not fail the run yet.** They report at
warning and suggestion level, because the existing pages carry 561 and 1,229 of them
respectively and a blocking rule would fail every pull request that touches one. The target is
error level for both, by this route:

1. The rules land non-blocking, so the count only goes down as people touch pages.
2. A dedicated pull request per rule sweeps the corpus. Neither sweep is safe to apply
   mechanically. "Click" as a noun and the deliberately formal phrasing in some reference
   tables both need a person, so this is a reviewed pass, not `vale --fix`.
3. Flip `level:` to `error` in the rule file once the count is zero.

Nothing checks the two bolding rules in section 11 of the style guide, and nothing will.
Whether a noun is a button that should be bold needs someone who knows the product.

**Adding a word.** If Vale flags a term that is spelled correctly, add it to the vocabulary:

- `config/vocabularies/Infisical/canonical/accept.txt` for a term with one correct casing.
  Note that a multi-word entry forces its casing on every heading containing it, so only put
  a phrase here when it is always Title Case.
- `config/vocabularies/Infisical/any-case/accept.txt`, prefixed with `(?i)`, for anything that
  legitimately appears in more than one case -- a product noun that doubles as a common noun,
  or an acronym that collides with an ordinary word.

Comments in those files need a hash **and a space**: `#Foo` is read as a pattern, not a comment.

Prefer listing a distinctive word on its own rather than relying on a multi-word entry to
cover it. Our Vale masks a multi-word phrase so its parts are accepted; Mintlify's CI Vale
does not, so `Ab Initio` alone left `Initio` reported there.

**Rules must survive both Vale builds.** Mintlify's CI check runs its own Vale against this
same config, and the two do not agree on everything. A `conditional` rule scoped to `raw` was
dropped for this reason: it reported a missing `description` on 148 files that all had one.
`Infisical.ShellPrompts` and `Infisical.Placeholders` also use `scope: raw`, because they have
to see inside code blocks; they behave correctly locally, but treat their CI behavior as
unverified. Anything that needs a whole-file view is safer as a separate check than as a Vale
rule.

**Write rules here rather than installing a style package.** The Google and Microsoft styles
that `vale sync` can fetch cover some of the same ground, and `Microsoft.UIVerbs` is close to
`Infisical.UIActions`. Installing one costs more than it saves. `Packages` requires a
`vale sync` that Mintlify's runner does not perform, so a config naming a style it has not
downloaded breaks that check; CI pins Vale by version and verified checksum, which a synced
package cannot match; and enabling two rules out of forty-six means a long disable list that
silently grows every time the package adds a rule. Copy the mechanics that are worth having and
own the file.

**Enforcing a spelling.** Add a swap to `Infisical/Terminology.yml`. List only forms that are
always wrong, and remember the lowercase spelling of a product name is usually its binary,
package, or API group.

**Suppressing a rule.** Vale's sentence-case check has a few known blind spots around colons
and single-letter labels. Where it is wrong, silence it in place rather than weakening the rule:

```mdx
{/* vale Infisical.SentenceCaseHeadings = NO */}

## Option A: Managed PostgreSQL service

{/* vale Infisical.SentenceCaseHeadings = YES */}
```

`{/* vale off */}` and `{/* vale on */}` disable everything between them.

## Getting familiar with Mintlify

New to Mintlify? [Start Here](https://mintlify.com/docs/quickstart)

## 👩‍💻 Development

Install the [Mint CLI](https://www.npmjs.com/package/mint) to preview the documentation changes locally. To install, use the following command

```
npm i -g mint
```

Run the following command at the root of your documentation (where docs.json is)

```
mint dev
```

## Troubleshooting

- `mint dev` isn't running - Run `mint update` to update the Mint CLI.
- Page loads as a 404 - Make sure you are running in a folder with `docs.json`. Check the `/docs` folder
