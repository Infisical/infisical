---
name: docs-style
description: Write, edit, and review Infisical documentation to the house style guide. Use whenever creating or changing any file under docs/ (.mdx pages, snippets, docs.json navigation), when asked to document a feature, write or update a guide, or review a docs diff or pull request. Covers running the Vale linter and the sentence-level review that Vale can't do.
---

# Infisical docs style

`docs/STYLE_GUIDE.md` holds every rule for Infisical documentation. This skill doesn't repeat
the rules. This skill describes how to apply them.

**Before you write or review anything, read all of `docs/STYLE_GUIDE.md` with the Read tool.**
Don't work from a summary, a diff, or your memory of the guide. Each rule in the guide comes
with an "Instead of" and "Write" example, and the examples show what the rule means better
than any summary can.

## Before you write

Ask the engineer for the facts before you draft anything. Only the engineer knows how the
feature works, and a draft written without those facts sounds plausible but tells the reader
nothing useful.

A model is useful for a page's structure: grouping and ordering the sections, and noticing a
missing section. A model isn't good at writing the sentences. A page with a model-written
outline and engineer-written sentences reads better than a page the model wrote entirely, so
offer the engineer that split instead of assuming they want a full draft.

Check every fact against the product, not against other docs pages, because other docs pages
are often out of date:

- **UI steps:** Take button, tab, and field names and the order of screens from the running
  product, or from the frontend source if you can't reach the running product
- **Behavior claims:** Read the code path before you describe what the product does; if
  another docs page seems to contradict the code, find out why before you edit either page

## Reviewing

Review your own drafts the same way you review anyone else's. Work in the following order.
Check the structure first, because rewriting a sentence is wasted work if the sentence is in
the wrong section.

**1. Run the linter.** Run `make lint-docs-branch` from the repository root. The command exits
with an error only for error-level problems, so also read the warnings and suggestions it
prints. `Infisical.UIActions` and `Infisical.Contractions` don't affect the exit code yet, and
those two rules are the ones most likely to report problems.

Vale doesn't check text indented four or more spaces inside a Mintlify component, and about
half of the text in this repository is indented that way. If Vale reports no problems on a
page with nested components, the nested text still needs the checks in steps 3 and 4.

**2. Check the structure against sections 1, 4, 7, 8, and 10 of the guide.** Headings, section
order, and section breaks are usually fine, whether a person or a model wrote the draft. If the
structure passes those sections, keep the structure and go to step 3.

**3. Check every sentence against sections 3 and 5 of the guide.** Go through the sections one
`###` heading at a time. Each heading names one rule, so for each heading, read every sentence
on the page and check whether the sentence breaks that rule. Then read every sentence out loud,
as section 5 describes.

**4. Check the formatting against section 11 of the guide.** No automated check covers any
rule in section 11, so check each rule by reading the page.

Before you hand a draft back, check the draft for every mistake you've already been corrected
on, including corrections earlier in the same conversation.

**5. Report the findings, then offer to apply them.** Write one finding per line: the location
as `path/to/file.mdx:12`, the sentence as written, the rule the sentence breaks, and your
rewrite. Group the findings by file. Then, before you edit anything, ask once whether to apply
the whole set of findings.

Don't rewrite an engineer's sentences without asking. An engineer's wording often sounds more
natural than your rewrite does, so ask the engineer whether they would have written your
version themselves.

## When Vale is wrong

`docs/CONTRIBUTING.MD` describes how to add a word to the vocabulary, enforce a spelling, and
turn off a rule for one line with `{/* vale Infisical.RuleName = NO */}`. Turn off a rule only
on a specific line where Vale is actually wrong, never to hide problems across a whole page.
