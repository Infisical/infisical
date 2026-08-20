# Contributing to the documentation

## Style guide

**Read [STYLE_GUIDE.md](./STYLE_GUIDE.md) before writing documentation.** It covers:

- Writing for users (not implementers)
- Cross-referencing related concepts
- Using Mintlify components (`<Steps>`, `<Tabs>`, `<Card>`, etc.)
- Page structure and formatting

## Linting prose

Parts of the style guide are enforced by [Vale](https://vale.sh). Install it and run the
linter from the repository root:

```
brew install vale
make lint-docs
```

The configuration lives in `docs/.vale.ini` and `docs/.vale/styles/`. Vale 3.17.1 or later is
expected; the config pins `.mdx` to the Markdown parser, so behavior is tied to the version.

`make lint-docs` is the same `vale` invocation that Mintlify's Vale CI check runs, so local
and CI results match. You can also run `vale <path>` directly on a subset.

What it checks: sentence case in headings and in the `title`/`sidebarTitle` frontmatter
fields, the enforced spellings in
`docs/.vale/styles/Infisical/Terminology.yml`, spelling against the vocabulary in
`docs/.vale/styles/config/vocabularies/Infisical/`, `$` prompts that break copy-paste,
placeholders like `foo`, and em dashes piling up in one paragraph.

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
