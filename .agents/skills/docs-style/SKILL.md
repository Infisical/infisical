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

## Templates

To check if the page you're documenting has a template to follow, start from the matching file in
[templates/](templates/README.md). The README says which template fits and how the snippets
shared between integration pages work.

## Before you write

Find the facts yourself, in the code and the running product, before you draft anything. Don't
ask a question that the code can answer. Ask only about what the code can't tell you, such as
why a feature exists or who it's for.

Check every fact against the product, not against other docs pages, because other docs pages
are often out of date:

- **UI steps:** Take button, tab, and field names and the order of screens from the running
  product, or from the frontend source if you can't reach the running product
- **Behavior claims:** Read the code path before you describe what the product does; if
  another docs page seems to contradict the code, find out why before you edit either page

## Reviewing

Review your own drafts the same way you review anyone else's. Work in the following order:
cut first, then check the structure, then check the sentences, then review the edited page
again. Rewriting a sentence is wasted work if the sentence shouldn't be on the page, or if it's
in the wrong section.

**1. Run the linter.** Run `make lint-docs-branch` from the repository root. Every rule except
`Infisical.EmDashes` reports at error level, so any other finding fails the command, including
`Infisical.UIActions` and `Infisical.Contractions`, the two rules most likely to report problems.
`Infisical.EmDashes` reports at warning level and doesn't change the exit code, so also read the
warnings the command prints.

Vale doesn't check text indented four or more spaces inside a Mintlify component, and about
half of the text in this repository is indented that way. If Vale reports no problems on a
page with nested components, the nested text still needs the checks in steps 2, 4, and 5.

**2. Cut what the reader won't act on.** Read the page one paragraph at a time. For each fact,
ask what the reader would do differently after reading it, as "Leave out what the reader won't
act on" in section 2 of the guide describes. If the answer is nothing, the fact is a finding,
even if it's true and you checked it in the code.

None of the other steps catches this. A sentence that shouldn't be on the page can still pass
every rule in section 5, and if you restructure it instead of cutting it, the page gets more
headings and lists without getting any shorter.

Apply this step to everything on the page: content that was already there, content someone else
wrote, and your own draft. Treat each cut like any other finding.

**3. Check the structure against sections 1, 4, 6, 7, 8, and 10 of the guide.** Check every
section of the page against each of those sections of the guide, including the page sections
that look fine at first glance.

**4. Check every sentence against sections 3 and 5 of the guide.** Go through the sections one
`###` heading at a time. Each heading names one rule, so for each heading, read every sentence
on the page and check whether the sentence breaks that rule. Then read every sentence out loud,
as section 5 describes.

**5. Check the formatting against section 11 of the guide.** No automated check covers any
rule in section 11, so check each rule by reading the page.

Before you hand a draft back, check the draft for every mistake you've already been corrected
on, including corrections earlier in the same conversation.

**6. Apply the findings.** Edit the page to fix every finding. Don't commit anything.

If the person you're working with wrote or edited the prose themselves in this conversation,
don't change their sentences yet. Report those findings in the format in step 8, and ask once
whether to apply them.

**7. Review the edited page.** Run steps 1 to 5 again on the whole edited page, from the top.
Your own edits create new problems. For example, turning part of a paragraph into a list can
leave several short paragraphs in a row, and moving content can put a section out of order.
Fix what you find before you hand the page back.

**8. Report what you changed.** Write one change per line: the location as
`path/to/file.mdx:12`, the rule the change fixes, the text before the change, and the text
after it, or "cut" for a finding from step 2. Group the changes by file, and include the fixes
from step 7.

## When Vale is wrong

`docs/CONTRIBUTING.MD` describes how to add a word to the vocabulary, enforce a spelling, and
turn off a rule for one line with `{/* vale Infisical.RuleName = NO */}`. Turn off a rule only
on a specific line where Vale is actually wrong, never to hide problems across a whole page.
