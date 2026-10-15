# ApprovalQueue

A pattern, not a component: the requests waiting on you, built from a framed List of link rows. Each request moves through new, pending, then resolved or failed, and stays in place the whole time.

## Built from

- `List` with `title="Needs you"`, a count as its `action` ("3 waiting"), a "View history" `footer`, and `actionsPlacement="below"`, so each row's actions sit in a second row under the text and the age ends every title line in the same place.
- One `Item` per request: `href` to the request, `current` while it is open, the object in mono in the `title`, who asked and what it needs as the `description`, the age as `meta`.

## States

- New: `unread` until the request is opened.
- Pending: the pressed action's Button takes `loading` and a present participle ("Approving"); its partner is disabled.
- Resolved: `resolved`, the title in past tense ("change approved"), what happened as the description, and one `link` Button to take it back ("Undo", "Revoke").
- Failed: the icon tile takes `tone="bad"`, the `error` line says what broke and what to do, and the action becomes "Retry".

## Rules

- Actions live in the second row, in every state: the decision ("View diff", "Approve"), the way back ("Undo", "Revoke") and the recovery ("Retry"). Two at most, primary last; everything else is in the request.
- The age is always `meta`, so it ends the title line of every row whether or not the row has actions.
- Offer undo instead of a confirm dialog, unless the change cannot be taken back.
- Never remove a resolved row while the page is open. The count in the header drops instead.

