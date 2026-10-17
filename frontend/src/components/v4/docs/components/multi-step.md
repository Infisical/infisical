# MultiStep

> **v4 status:** Not yet implemented. These guidelines describe the target behavior.

A task in steps, where each step checks its fields before the next: a step indicator shows where you are and lets you go back, and each step slides in from the direction of travel while its box eases to the new height. It comes in three containers.

## Variants

- `dialog`: grows out of its `trigger` (a Tile, a button) and shrinks back into it when it closes, while the trigger waits hidden underneath; its ground and border ease from the trigger's to the dialog's. The dialog resizes to each step: height always, width when a step sets `width`. For a short task started from one object, like connecting an integration.
- `sheet`: the right-hand Sheet, for a task that changes the list behind it (import secrets). The steps bar sits under the title.
- `page`: in the page, a vertical step list beside a plain card that holds each step's eyebrow ("Step 2 of 4"), heading, lede, fields and footer. Under 640px the list turns into the steps bar above the card. For longer setup (a machine identity).

## You provide

- `steps`: `[{ title, heading?, description?, summary?, content, validate?, width?, nextLabel? }]`. `title` is short, for the indicator ("Source", "Review"); `heading` and `description` head the step in the page variant; `summary` is the step list's line (what was picked: "github-deployer").
- `validate`: return true (or nothing) to move on, false to stay while you show field errors (focus goes to the first invalid field), or a message for the footer. A promise works too; Continue is busy while it runs.
- `onComplete`: after the last step validates. Return a promise to keep the primary busy; reject with an Error to show its message. `completeLabel` names what it does ("Connect", "Import 4 secrets", "Create identity").
- `title` (the sheet or dialog title), `open` / `onOpenChange` (sheet and dialog), `trigger` (dialog), `onCancel`, `step` / `onStepChange` to control it.

## The footer

"Step 2 of 3" on the left (in the page variant the card's eyebrow says it), or what failed. On the right, 12px apart: Cancel on the first step and Back after it, then the primary. Enter in a text field continues. Moving to a step moves focus to its first field, so a second Enter never skips a step.

## Steps

`Steps` is the indicator on its own. Horizontal: the ProgressSteps segments (done in ink, the current one hatched, upcoming on `line-soft`, an error in `bad`) with a 12px label under each. Vertical: 24px square markers (upcoming: a `line` border and a muted number; current: a 1px ink border; done: an ink fill with a check), joined by a rule that turns ink behind you, with each step's title and one line. Steps up to the furthest reached are buttons when `onStepClick` is set.

## Rules

- Three to five steps. Two is a dialog with a section; more than five is a page of its own.
- Titles are nouns. The last step reviews what will happen and its primary names it.
- Keep values when going back. Nothing is saved until the last step.
- Steps are not tabs: they run in order and validate. For sections you can visit in any order, use Tabs.
- Inside the dialog and the sheet, prefer fields that do not open lists (inputs, checkboxes, segmented Tabs, Tiles); Select and Combobox lists open inside the scrolling body.
