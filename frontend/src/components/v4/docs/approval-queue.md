# Approval queue

Requests waiting on you, each moving through new, pending, then resolved or failed in place.

## Choose this component

Choose ApprovalQueue for decisions waiting on someone. Use ActivityLog for what already happened.

## Usage rules

### approval-queue-in-place

Owner: approval-queue.

When a request is resolved.

Do: Keep the row, put its title in the past tense and offer Undo; drop the header count instead.

Avoid: Remove the row as soon as it resolves.

Why: Rows that vanish make people doubt what they just did.

Checked by: review only. Look for: Approve a request and check the row stays with Undo and the count drops.

Source evidence:
- src/components/v4/patterns/approval-queue.tsx
- src/pages/design-system/examples/approval-queue/default.tsx

### approval-queue-recovery

Owner: approval-queue.

When a request fails.

Do: Say what broke and what to do in the error line and offer Retry.

Avoid: Show a generic failure with no next step.

Why: The person can only recover if they know how.

Checked by: review only. Look for: Read each failed row's error for a cause and a next step.

Source evidence:
- src/pages/design-system/examples/approval-queue/default.tsx

## State guidance

- pending: The pressed action is busy with a present participle; its partner is disabled.
- failed: A bad icon tile, the error line and Retry.

## Presentation rules

Do: Name the object in mono and the person who asked in the description.

Avoid: Title every row Approval request.

Why: People decide by what changes and who asked.

## Import and exports

- src/components/v4/patterns/approval-queue.tsx

Exports: ApprovalQueue. Source TypeScript defines the API.

## Behavior

- A framed List titled Needs you with the waiting count as its action and a View history footer.
- Actions sit in a second row under each request's text, so the age ends every title line in the same place.
- New requests are unread. Pending shows the pressed action busy and disables its partner. Resolved rows stay with Undo. Failed rows take a bad icon tile, the error line and Retry.

## Accessibility

- Each request title links to the request and marks the open one as current. Errors are announced as alerts.

## Use cases

- Use ApprovalQueue for requests that need the person's decision, with two actions at most per row.

## Avoid

- Remove a resolved row while the page is open, or confirm an approval that Undo can take back.

## Limits

- The host owns request state and the approve, undo and retry calls.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### request state

- new: example `default`, visible label "New, pending, resolved with undo, failed with retry".
- pending: example `default`, visible label "New, pending, resolved with undo, failed with retry".
- resolved: example `default`, visible label "New, pending, resolved with undo, failed with retry".
- failed: example `default`, visible label "New, pending, resolved with undo, failed with retry".

## Executable examples

### Requests in every state

Save this example at `src/pages/design-system/examples/approval-queue/default.tsx`; its relative imports are generated for that exact path. States: default, loading, success, error.

Registry items used: @infisical/approval-queue. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { ApprovalQueue, type ApprovalRequest } from "../../../../components/v4/patterns/approval-queue";
const initial: ApprovalRequest[] = [
    {
        id: "stripe",
        object: "stripe_api_key",
        title: (<>
        <code>stripe_api_key</code> change in production
      </>),
        description: "Priya Raman asked to rotate the key before Friday's release.",
        age: "4m",
        href: "#approval-queue",
        state: "new"
    },
    {
        id: "db",
        object: "database_url",
        title: (<>
        <code>database_url</code> change in production
      </>),
        description: "Marcus Okonkwo-Fitzgerald points it at the new replica.",
        age: "1h",
        href: "#approval-queue",
        state: "pending"
    },
    {
        id: "agent",
        object: "release-notes-agent",
        title: (<>
        <code>release-notes-agent</code> access approved
      </>),
        description: "Read access to staging for 1 hour, approved by you.",
        age: "2h",
        href: "#approval-queue",
        state: "resolved"
    },
    {
        id: "sync",
        object: "vercel-sync",
        title: (<>
        <code>vercel-sync</code> change in staging
      </>),
        description: "Sarah Lin adds 3 secrets to the sync.",
        age: "3h",
        href: "#approval-queue",
        state: "failed",
        error: "Vercel rejected the token. Reconnect Vercel, then retry."
    }
];
const diffs: Record<string, string> = {
    stripe: "- stripe_api_key = sk_live_...4f2a\n+ stripe_api_key = sk_live_...9c1e",
    db: "- database_url = postgres://primary.internal/payments\n+ database_url = postgres://replica-2.internal/payments",
    sync: "+ SENTRY_DSN\n+ REDIS_URL\n+ FEATURE_FLAGS_KEY"
};
export default function Example() {
    const [requests, setRequests] = useState(initial);
    const [viewing, setViewing] = useState<string>();
    const replace = (id: string, next: ApprovalRequest) => setRequests((value) => value.map((request) => (request.id === id ? next : request)));
    const original = (id: string) => initial.find((request) => request.id === id);
    const approve = (id: string) => {
        const base = original(id);
        if (!base)
            return;
        replace(id, { ...base, state: "pending", error: undefined });
        window.setTimeout(() => replace(id, {
            ...base,
            state: "resolved",
            error: undefined,
            title: (<>
              <code>{base.object}</code> change approved
            </>),
            description: "Approved by you just now."
        }), 1200);
    };
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <ApprovalQueue requests={requests} current="db" historyHref="#approval-queue" onApprove={approve} onView={(id) => setViewing(id)} onUndo={(id) => {
            const base = original(id);
            if (!base)
                return;
            replace(id, {
                ...base,
                state: "new",
                error: undefined,
                title: base.state === "resolved" ? (<>
                  <code>{base.object}</code> access requested
                </>) : (base.title),
                description: base.state === "resolved"
                    ? "Read access to staging for 1 hour. The approval was taken back."
                    : base.description
            });
        }} onRetry={approve}/>
      {viewing && diffs[viewing] && (<pre aria-label={`Diff for ${original(viewing)?.object}`}>{diffs[viewing]}</pre>)}
    </div><figcaption className="text-muted-foreground text-xs">{"New, pending, resolved with undo, failed with retry"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#approval-queue and exercise the documented interaction.
