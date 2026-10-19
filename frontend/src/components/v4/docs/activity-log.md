# Activity log

Who did what, one line per event, grouped by day with load more.

## Choose this component

Choose ActivityLog for a readable recent history. Use Table for the searchable audit log.

## Usage rules

### activity-log-voice

Owner: activity-log.

When an event is written.

Do: Start with the actor and use the past tense, with keys and machine names in mono.

Avoid: Write passive events such as Secret was updated.

Why: People scan the log for who did something.

Checked by: review only. Look for: Read each title for actor first and past tense.

Source evidence:
- src/pages/design-system/examples/activity-log/default.tsx

## State guidance

- loading more: Skeleton rows appear under the rows already there.
- all loaded: The footer counts the events shown.

## Presentation rules

Do: Keep times short and local; the section names the day.

Avoid: Repeat the full date on every row.

Why: The day heading already carries it.

## Import and exports

- src/components/v4/patterns/activity-log.tsx

Exports: ActivityLog. Source TypeScript defines the API.

## Behavior

- A plain small List with a section per day whose meta counts its events.
- Each event shows the actor's Avatar, the actor and what happened, a Badge for machines and agents, and the time.
- Load more adds skeleton rows under the existing rows and keeps the button busy; once everything is in, the footer says Showing 6 of 6 events.

## Accessibility

- The list keeps existing rows while loading and announces Loading items.

## Use cases

- Use ActivityLog for a short recent history beside an object, written actor first in the past tense.

## Avoid

- Use it as the audit log, or write events in the passive voice.

## Limits

- For filtering, sorting or exporting events, use a Table such as the audit log.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### paging

- more available: example `default`, visible label "Grouped by day, load more".
- loading more: example `default`, visible label "Grouped by day, load more".
- all loaded: example `default`, visible label "Grouped by day, load more".

## Executable examples

### Recent project activity

Save this example at `src/pages/design-system/examples/activity-log/default.tsx`; its relative imports are generated for that exact path. States: default, loading.

Registry items used: @infisical/activity-log. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { type ActivityDay, ActivityLog } from "../../../../components/v4/patterns/activity-log";
const firstPage: ActivityDay[] = [
    {
        label: "Today",
        events: [
            {
                id: "1",
                actor: "Sarah Lin",
                summary: (<>
            Sarah Lin updated <code>stripe_api_key</code>
          </>),
                time: "10:42"
            },
            {
                id: "2",
                actor: "github-deployer",
                actorKind: "machine",
                summary: (<>
            <code>github-deployer</code> read 14 secrets in production
          </>),
                time: "10:31"
            },
            {
                id: "3",
                actor: "release-notes-agent",
                actorKind: "agent",
                summary: (<>
            <code>release-notes-agent</code> requested read access to staging
          </>),
                time: "09:58"
            }
        ]
    },
    {
        label: "Yesterday",
        events: [
            {
                id: "4",
                actor: "Marcus Okonkwo-Fitzgerald",
                summary: "Marcus Okonkwo-Fitzgerald approved a change to production",
                time: "17:20"
            }
        ]
    }
];
const olderDay: ActivityDay = {
    label: "Oct 15",
    events: [
        {
            id: "5",
            actor: "Priya Raman",
            summary: (<>
          Priya Raman created <code>sentry_dsn</code>
        </>),
            time: "14:05"
        },
        {
            id: "6",
            actor: "Sarah Lin",
            summary: "Sarah Lin invited Priya Raman",
            time: "13:50"
        }
    ]
};
export default function Example() {
    const [days, setDays] = useState(firstPage);
    const [loading, setLoading] = useState(false);
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <ActivityLog days={days} total={6} loading={loading} onLoadMore={() => {
            setLoading(true);
            window.setTimeout(() => {
                setDays([...firstPage, olderDay]);
                setLoading(false);
            }, 1200);
        }}/>
    </div><figcaption className="text-muted-foreground text-xs">{"Grouped by day, load more"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#activity-log and exercise the documented interaction.
