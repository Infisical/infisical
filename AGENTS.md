## Feature Development

Check out CLAUDE.md for additional context on project file structure and general feature development.

## Backend Development

**Read the [Backend Code Quality Guide](backend/CODE_QUALITY.md) for any change under `backend/`, and check your work against it before reporting the task done.** Features, refactors, bug fixes, and reviews all count.

It is a short, deliberately non-exhaustive floor: error messages users can understand (and no pointless 500s), validation on every API input, correct pagination when calling third-party APIs, no deadlock conditions on a small connection pool, and REST-aligned API interfaces.

Treat that list as a summary of the guide's current contents, not as a condition for reading it. A change that does not look like any of those topics still gets checked, because the guide grows and because the items apply in places they are not obviously about (a bug fix that adds a query inside an existing transaction, a refactor that moves a third-party list call).

Some of it needs judgment rather than a mechanical check. The deadlock rules cannot be caught by testing one request at a time. And a design that breaks REST should be raised with the author, with the conforming alternative proposed, rather than implemented silently or quietly "fixed" (some deviations are deliberate).

## Documentation

**Use the `docs-style` skill for any work under `docs/`** (`.claude/skills/docs-style/`). It carries the procedure for the [Documentation Style Guide](docs/STYLE_GUIDE.md), including the sentence-level review pass Vale cannot check.

If the user wrote or edited the docs prose themselves, don't just accept it. Tell them the `docs-style` skill can run the review pass over their changes, and offer to run it.

The style guide covers writing for users (not implementers), Mintlify component usage, cross-referencing, page structure, the sentence-level writing rules in section 5, and the bolding and UI conventions in section 11.

Run `make lint-docs-branch` after any change under `docs/` (or `make lint-docs` for the whole site; the `Check docs style` CI check runs the branch variant). It runs [Vale](https://vale.sh) over the docs and enforces the mechanical half of the style guide. A clean run is not a substitute for reading the guide: the judgment calls it cannot check are the ones that matter most. Vale cannot see prose indented inside Mintlify components, so a clean run is not evidence that nested content was checked, and two rules report below error level so they never change the exit code.

## UI Development

When building frontend UI, follow [DESIGN.md](DESIGN.md) for the v3 design system — colors, typography, components, and voice.

## Issue and PR Guidelines

- Never create a GitHub issue.
- When creating a pull request, use and fully complete the repository's
  `.github/pull_request_template.md` template.
