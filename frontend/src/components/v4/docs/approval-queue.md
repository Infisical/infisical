# Approval queue

Requests waiting on you, each moving through new, pending, then resolved or failed in place.

## Choose this component

Choose ApprovalQueue for decisions waiting on someone. Use ActivityLog for what already happened.

## Usage rules

### approval-queue-inherits-list

Owner: approval-queue.

When changing how a queue variant looks.

Do: Change List's variant in data.module.css so List and every composite on it move together.

Avoid: Add CSS to the queue that restyles its List's rows, cards, rules, header or footer.

Why: The queue's variants are List's variants; a local override makes them drift apart.

Checked by: review only. Look for: The pattern ships no stylesheet, and its segmented and divided renders match List's.

Source evidence:
- src/components/v4/patterns/approval-queue.tsx
- src/pages/design-system/examples/approval-queue/variants.tsx

### approval-queue-variant

Owner: approval-queue.

When placing a queue on a page.

Do: Keep framed where the queue sits beside other framed panels, use segmented when the queue is the page's main content, and use divided inside a surface that already has an edge, such as a Card or a sheet.

Avoid: Wrap a segmented or divided queue in a Card or frame of your own, or mark a card with a colored left edge.

Why: Each variant brings its own ground. A second wrapper doubles the edge, and state belongs to the whole card's fill, the icon tile and the words.

Checked by: review only. Look for: Check the queue's parent has no frame, Card or border of its own unless the variant is divided.

Source evidence:
- src/components/v4/patterns/approval-queue.tsx
- src/pages/design-system/examples/approval-queue/variants.tsx

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

Do: Name the object in mono when it is a machine value such as a secret key, in the sans when it is a name such as an identity, and the person who asked in the description.

Avoid: Title every row Approval request.

Why: People decide by what changes and who asked.

## Import and exports

- src/components/v4/patterns/approval-queue.tsx

Exports: ApprovalQueue, ApprovalQueueHeader, ApprovalQueueList, ApprovalQueueGroup, ApprovalQueueItem, ApprovalQueueFooter. Source TypeScript defines the API.

## Behavior

- Compose ApprovalQueue from ApprovalQueueHeader (title, count and an actions slot), ApprovalQueueList with ApprovalQueueItem rows and optional ApprovalQueueGroup labels, and an optional ApprovalQueueFooter.
- The variant passes straight through to List, which owns every ground, gap, rule, hover, press and resolved fill: framed (default) is List's tint frame with the eyebrow band, segmented makes each item a borderless tint card under a header row, and divided splits items with line-soft rules. The parts lower to ListHeader, ListSection, ListRow and ListFooter. The queue adds only its extras: the icon and failed tiles, the unread dot, the Approve, View diff, Undo and Retry actions, the resolved and failed states, and its default copy.
- Passing requests instead of children renders the composed queue for you: header Needs you with the waiting count, one item per request and a View history footer when historyHref is set. It takes the same variant.
- Actions sit in a second row under each request's text, so the age ends every title line in the same place.
- Approve is the accent Button in every variant and in the props API: an approval moment keeps the accent (rule/accent-create). It stays accent while pending, with its spinner; View diff and Retry stay outline and Undo stays a link.
- New requests are unread. Pending shows the pressed action busy and disables its partner. Resolved rows stay with Undo. Failed rows take a bad icon tile, the error line and Retry.
- onUndo is optional. Without it resolved rows stay in place with no action, for decisions the host cannot take back.
- loading replaces the items with loadingRows (default 3) skeleton items in the item geometry of the current variant: a 40px media square, a title bar with a short age bar at the end of its line, a description bar and two button-height action bars in the row below. The header (without its count in the props API) and the footer stay. loadingLabel names what loads, Loading requests by default, and is announced with aria-busy on the queue.

## Accessibility

- Each request title links to the request and marks the open one as current. Errors are announced as alerts.
- While loading, the skeleton items are hidden from assistive technology and the queue announces loadingLabel once.
- ApprovalQueueList's label names the list (Requests waiting on you by default); the header title is visible text, not a heading.

## Use cases

- Use ApprovalQueue for requests that need the person's decision, with two actions at most per row.

## Avoid

- Remove a resolved row while the page is open, or confirm an approval that Undo can take back.

## Limits

- Header, list and footer must be direct children of ApprovalQueue, and items and groups direct children of ApprovalQueueList or ApprovalQueueGroup (arrays are fine). The parts are found by element type, so one inside a fragment or another wrapper is skipped.
- Groups take a plain label and no count. Use them to split a long queue by day or environment, not to nest queues.
- The host owns request state and the approve, undo and retry calls. Leave out onUndo only when the decision really cannot be reversed, and say so in the resolved row's description.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- framed: example `variants`, visible label "framed".
- segmented: example `variants`, visible label "segmented".
- divided: example `variants`, visible label "divided".

### request state

- new: example `default`, visible label "New, pending, resolved with undo, failed with retry".
- pending: example `default`, visible label "New, pending, resolved with undo, failed with retry".
- resolved: example `default`, visible label "New, pending, resolved with undo, failed with retry".
- failed: example `default`, visible label "New, pending, resolved with undo, failed with retry".

## Executable examples

### Requests in every state

Save this example at `src/pages/design-system/examples/approval-queue/default.tsx`; its relative imports are generated for that exact path. States: default, loading, success, error.

Registry items used: @cipher/approval-queue. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { ApprovalQueue, type ApprovalRequest } from "../../../../components/v4/patterns/approval-queue";

const initial: ApprovalRequest[] = [
  {
    id: "stripe",
    object: "stripe_api_key",
    title: (
      <>
        <code>stripe_api_key</code> change in production
      </>
    ),
    description: "Priya Raman asked to rotate the key before Friday's release.",
    age: "4m",
    href: "#approval-queue",
    state: "new"
  },
  {
    id: "db",
    object: "database_url",
    title: (
      <>
        <code>database_url</code> change in production
      </>
    ),
    description: "Marcus Okonkwo-Fitzgerald points it at the new replica.",
    age: "1h",
    href: "#approval-queue",
    state: "pending"
  },
  {
    id: "agent",
    object: "release-notes-agent",
    title: <>release-notes-agent access approved</>,
    description: "Read access to staging for 1 hour, approved by you.",
    age: "2h",
    href: "#approval-queue",
    state: "resolved"
  },
  {
    id: "sync",
    object: "vercel-sync",
    title: <>vercel-sync change in staging</>,
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
  const replace = (id: string, next: ApprovalRequest) =>
    setRequests((value) => value.map((request) => (request.id === id ? next : request)));
  const original = (id: string) => initial.find((request) => request.id === id);
  const approve = (id: string) => {
    const base = original(id);
    if (!base) return;
    replace(id, { ...base, state: "pending", error: undefined });
    window.setTimeout(
      () =>
        replace(id, {
          ...base,
          state: "resolved",
          error: undefined,
          title: (
            <>
              <code>{base.object}</code> change approved
            </>
          ),
          description: "Approved by you just now."
        }),
      1200
    );
  };
  const undo = (id: string) => {
    const base = original(id);
    if (!base) return;
    replace(id, {
      ...base,
      state: "new",
      error: undefined,
      title:
        base.state === "resolved" ? (
          <>
            <code>{base.object}</code> access requested
          </>
        ) : (
          base.title
        ),
      description:
        base.state === "resolved"
          ? "Read access to staging for 1 hour. The approval was taken back."
          : base.description
    });
  };
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
        <ApprovalQueue
          requests={requests}
          current="db"
          historyHref="#approval-queue"
          onApprove={approve}
          onView={(id) => setViewing(id)}
          onUndo={undo}
          onRetry={approve}
        />
        {viewing && diffs[viewing] && (
          <pre aria-label={`Diff for ${original(viewing)?.object}`}>{diffs[viewing]}</pre>
        )}
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {"New, pending, resolved with undo, failed with retry"}
      </figcaption>
    </figure>
  );
}
```

### Without undo

Save this example at `src/pages/design-system/examples/approval-queue/without-undo.tsx`; its relative imports are generated for that exact path. States: default, success.

Registry items used: @cipher/approval-queue. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { ApprovalQueue, type ApprovalRequest } from "../../../../components/v4/patterns/approval-queue";

const initial: ApprovalRequest[] = [
  {
    id: "rotation",
    object: "github_token",
    title: (
      <>
        <code>github_token</code> rotation in production
      </>
    ),
    description: "Dana Whitfield asked to rotate the token after the audit.",
    age: "12m",
    href: "#approval-queue",
    state: "new"
  },
  {
    id: "export",
    object: "audit-export",
    title: <>audit-export access approved</>,
    description: "Read access to audit logs for 1 day, approved by you. Approvals here are final.",
    age: "1h",
    href: "#approval-queue",
    state: "resolved"
  }
];

export default function Example() {
  const [requests, setRequests] = useState(initial);
  const approve = (id: string) =>
    setRequests((value) =>
      value.map((request) =>
        request.id === id
          ? {
              ...request,
              state: "resolved",
              error: undefined,
              title: (
                <>
                  <code>{request.object}</code> change approved
                </>
              ),
              description: "Approved by you just now."
            }
          : request
      )
    );
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
        <ApprovalQueue requests={requests} onApprove={approve} onRetry={approve} />
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {"Resolved rows without undo"}
      </figcaption>
    </figure>
  );
}
```

### Framed, segmented and divided

Save this example at `src/pages/design-system/examples/approval-queue/variants.tsx`; its relative imports are generated for that exact path. States: default, loading, success, error.

Registry items used: @cipher/approval-queue, @cipher/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import {
  ApprovalQueue,
  ApprovalQueueFooter,
  ApprovalQueueHeader,
  ApprovalQueueItem,
  ApprovalQueueList,
  type ApprovalQueueVariant,
  type ApprovalRequest
} from "../../../../components/v4/patterns/approval-queue";
import { Button } from "../../../../components/v4/ui/button";

const initial: ApprovalRequest[] = [
  {
    id: "stripe",
    object: "stripe_api_key",
    title: (
      <>
        <code>stripe_api_key</code> change in production
      </>
    ),
    description: "Priya Raman asked to rotate the key before Friday's release.",
    age: "4m",
    href: "#approval-queue",
    state: "new"
  },
  {
    id: "db",
    object: "database_url",
    title: (
      <>
        <code>database_url</code> change in production
      </>
    ),
    description: "Marcus Okonkwo-Fitzgerald points it at the new replica.",
    age: "1h",
    href: "#approval-queue",
    state: "pending"
  },
  {
    id: "agent",
    object: "release-notes-agent",
    title: <>release-notes-agent access approved</>,
    description: "Read access to staging for 1 hour, approved by you.",
    age: "2h",
    href: "#approval-queue",
    state: "resolved"
  },
  {
    id: "export",
    object: "audit-export",
    title: <>audit-export access approved</>,
    description: "Read access to audit logs for 1 day, approved by you. Approvals here are final.",
    age: "3h",
    href: "#approval-queue",
    state: "resolved"
  },
  {
    id: "sync",
    object: "vercel-sync",
    title: <>vercel-sync change in staging</>,
    description: "Sarah Lin adds 3 secrets to the sync.",
    age: "3h",
    href: "#approval-queue",
    state: "failed",
    error: "Vercel rejected the token. Reconnect Vercel, then retry."
  }
];

const final = new Set(["export"]);

function useRequests() {
  const [requests, setRequests] = useState(initial);
  const replace = (id: string, next: (request: ApprovalRequest) => ApprovalRequest) =>
    setRequests((value) => value.map((request) => (request.id === id ? next(request) : request)));
  const approve = (id: string) => {
    replace(id, (request) => ({ ...request, state: "pending", error: undefined }));
    window.setTimeout(
      () =>
        replace(id, (request) => ({
          ...request,
          state: "resolved",
          error: undefined,
          title: (
            <>
              <code>{request.object}</code> change approved
            </>
          ),
          description: "Approved by you just now."
        })),
      1200
    );
  };
  const undo = (id: string) =>
    replace(id, (request) => ({
      ...request,
      state: "new",
      error: undefined,
      title: (
        <>
          <code>{request.object}</code> access requested
        </>
      ),
      description: "The approval was taken back."
    }));
  const waiting = `${requests.filter((request) => request.state !== "resolved").length} waiting`;
  const item = (request: ApprovalRequest) => (
    <ApprovalQueueItem
      key={request.id}
      request={request}
      onApprove={approve}
      onUndo={final.has(request.id) ? undefined : undo}
      onRetry={approve}
    />
  );
  return { requests, waiting, item };
}

function Queue({ variant }: { variant: ApprovalQueueVariant }) {
  const { requests, waiting, item } = useRequests();
  return (
    <ApprovalQueue variant={variant}>
      <ApprovalQueueHeader title="Needs you" count={waiting} />
      <ApprovalQueueList>{requests.map(item)}</ApprovalQueueList>
      <ApprovalQueueFooter>
        <Button variant="link" size="sm" asChild>
          <a href="#approval-queue">View history</a>
        </Button>
      </ApprovalQueueFooter>
    </ApprovalQueue>
  );
}

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Queue variant="framed" />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"framed"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Queue variant="segmented" />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"segmented"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Queue variant="divided" />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"divided"}</figcaption>
      </figure>
    </div>
  );
}
```

### Loading in each variant

Save this example at `src/pages/design-system/examples/approval-queue/loading.tsx`; its relative imports are generated for that exact path. States: loading.

Registry items used: @cipher/approval-queue. Additional packages: none. Install every listed item before compiling this example.

```tsx
import {
  ApprovalQueue,
  type ApprovalQueueVariant
} from "../../../../components/v4/patterns/approval-queue";

const variants: ApprovalQueueVariant[] = ["framed", "segmented", "divided"];

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      {variants.map((variant) => (
        <figure key={variant} className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
            <ApprovalQueue
              variant={variant}
              loading
              loadingRows={2}
              loadingLabel="Loading change requests"
              requests={[]}
              onApprove={() => {}}
              onRetry={() => {}}
            />
          </div>
          <figcaption className="text-muted-foreground text-xs">{variant}</figcaption>
        </figure>
      ))}
    </div>
  );
}
```

### Segmented with group labels

Save this example at `src/pages/design-system/examples/approval-queue/grouped.tsx`; its relative imports are generated for that exact path. States: default, loading, success, error.

Registry items used: @cipher/approval-queue, @cipher/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import {
  ApprovalQueue,
  ApprovalQueueGroup,
  ApprovalQueueHeader,
  ApprovalQueueItem,
  ApprovalQueueList,
  type ApprovalRequest
} from "../../../../components/v4/patterns/approval-queue";
import { Button } from "../../../../components/v4/ui/button";

const initial: ApprovalRequest[] = [
  {
    id: "stripe",
    object: "stripe_api_key",
    title: (
      <>
        <code>stripe_api_key</code> change in production
      </>
    ),
    description: "Priya Raman asked to rotate the key before Friday's release.",
    age: "4m",
    href: "#approval-queue",
    state: "new"
  },
  {
    id: "db",
    object: "database_url",
    title: (
      <>
        <code>database_url</code> change in production
      </>
    ),
    description: "Marcus Okonkwo-Fitzgerald points it at the new replica.",
    age: "1h",
    href: "#approval-queue",
    state: "pending"
  },
  {
    id: "agent",
    object: "release-notes-agent",
    title: <>release-notes-agent access approved</>,
    description: "Read access to staging for 1 hour, approved by you.",
    age: "2h",
    href: "#approval-queue",
    state: "resolved"
  },
  {
    id: "export",
    object: "audit-export",
    title: <>audit-export access approved</>,
    description: "Read access to audit logs for 1 day, approved by you. Approvals here are final.",
    age: "3h",
    href: "#approval-queue",
    state: "resolved"
  },
  {
    id: "sync",
    object: "vercel-sync",
    title: <>vercel-sync change in staging</>,
    description: "Sarah Lin adds 3 secrets to the sync.",
    age: "3h",
    href: "#approval-queue",
    state: "failed",
    error: "Vercel rejected the token. Reconnect Vercel, then retry."
  }
];

const final = new Set(["export"]);

function useRequests() {
  const [requests, setRequests] = useState(initial);
  const replace = (id: string, next: (request: ApprovalRequest) => ApprovalRequest) =>
    setRequests((value) => value.map((request) => (request.id === id ? next(request) : request)));
  const approve = (id: string) => {
    replace(id, (request) => ({ ...request, state: "pending", error: undefined }));
    window.setTimeout(
      () =>
        replace(id, (request) => ({
          ...request,
          state: "resolved",
          error: undefined,
          title: (
            <>
              <code>{request.object}</code> change approved
            </>
          ),
          description: "Approved by you just now."
        })),
      1200
    );
  };
  const undo = (id: string) =>
    replace(id, (request) => ({
      ...request,
      state: "new",
      error: undefined,
      title: (
        <>
          <code>{request.object}</code> access requested
        </>
      ),
      description: "The approval was taken back."
    }));
  const waiting = `${requests.filter((request) => request.state !== "resolved").length} waiting`;
  const item = (request: ApprovalRequest) => (
    <ApprovalQueueItem
      key={request.id}
      request={request}
      onApprove={approve}
      onUndo={final.has(request.id) ? undefined : undo}
      onRetry={approve}
    />
  );
  return { requests, waiting, item };
}

const today = new Set(["stripe", "db", "sync"]);

export default function Example() {
  const { requests, waiting, item } = useRequests();
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
        <ApprovalQueue variant="segmented">
          <ApprovalQueueHeader
            title="Needs you"
            count={waiting}
            actions={
              <Button variant="link" size="sm" asChild>
                <a href="#approval-queue">View history</a>
              </Button>
            }
          />
          <ApprovalQueueList>
            <ApprovalQueueGroup label="Today">
              {requests.filter((request) => today.has(request.id)).map(item)}
            </ApprovalQueueGroup>
            <ApprovalQueueGroup label="November 3, 2026">
              {requests.filter((request) => !today.has(request.id)).map(item)}
            </ApprovalQueueGroup>
          </ApprovalQueueList>
        </ApprovalQueue>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {"Segmented, grouped by day, with a header action"}
      </figcaption>
    </figure>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#approval-queue and exercise the documented interaction.
