# Announcements

What's new, as cards that cycle in a 480px dialog with dots, Back and Next.

## Choose this component

Choose Announcements for release notes people opt into. Use Banner for a standing condition and Toast for the result of an action.

## Usage rules

### announcements-titles

Owner: announcements.

When a card describes a new feature.

Do: Title it with what people can now do, such as Share a secret with a link that expires.

Avoid: Use the feature's internal name as the title.

Why: A capability tells people why to care.

Checked by: review only. Look for: Read each card title as an action someone can take today.

Source evidence:
- src/pages/design-system/examples/announcements/default.tsx

### announcements-media

Owner: announcements.

When a card has media.

Do: Show the real feature built from v4 components, made inert.

Avoid: Use screenshots, illustrations or gradients.

Why: Real components stay accurate in both themes and at every corner setting.

Checked by: review only. Look for: Inspect each media area for components rather than images.

Source evidence:
- src/components/v4/ui/announcements.tsx
- src/pages/design-system/examples/announcements/default.tsx

## State guidance

- last card: Next reads Done and closes the dialog.
- seen: The host clears the unseen count from onSeen.

## Presentation rules

Do: Keep the eyebrow to the area and the date.

Avoid: Add exclamation marks or New badges to every card.

Why: The dialog already says these are new.

## Import and exports

- src/components/v4/ui/announcements.tsx
- src/components/v4/ui/announcements.module.css

Exports: Announcements. Source TypeScript defines the API.

## Behavior

- Each card has inert media, an eyebrow, a title, a line or two and an optional action link.
- Cards slide in the direction of travel and the dialog eases to each card's height; reduced motion jumps.
- Left and Right move and wrap around unless loop is false. Dots jump to a card. Next becomes Done on the last card and Done closes.
- onSeen fires as each card shows, so the host can clear its unread count.

## Accessibility

- The dialog is a carousel; each card is a slide named 2 of 4, and a polite live region reads the position and title on each change.
- Focus starts on Next.

## Use cases

- Use Announcements from a What's new row or button with a count of unseen cards, with three to five cards newest first.

## Avoid

- Open it on its own over someone's work, or fill the media with illustrations or gradients.

## Limits

- Swipe on touch is not implemented; use the dots or Back and Next.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size support


- no authored named size: omitted. The dialog is always 480px wide and its height follows each card.

## Executable examples

### What's new

Save this example at `src/pages/design-system/examples/announcements/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @infisical/announcements, @infisical/badge, @infisical/button, @infisical/list, @infisical/snippet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Announcements } from "../../../../components/v4/ui/announcements";
import { Count } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { List, ListRow } from "../../../../components/v4/ui/list";
import { Snippet } from "../../../../components/v4/ui/snippet";
const items = [
    {
        id: "share",
        eyebrow: "Secrets, Sep 24",
        title: "Share a secret with a link that expires",
        description: "Send a one-time link instead of pasting values into chat.",
        media: (<List label="Shared secrets" title="Shared links">
        <ListRow value="one" label="stripe_api_key" title="stripe_api_key" meta="Expires in 1 hour"/>
        <ListRow value="two" label="database_url" title="database_url" meta="Viewed"/>
      </List>),
        action: { label: "Share a secret", onClick: () => undefined }
    },
    {
        id: "cli",
        eyebrow: "CLI, Sep 18",
        title: "Run any command with your secrets injected",
        description: "The CLI now reads the environment from your project's default.",
        media: <Snippet label="Run command" value="infisical run -- npm start"/>
    },
    {
        id: "approvals",
        eyebrow: "Approvals, Sep 10",
        title: "Approve changes to production from the sidebar",
        description: "Requests waiting on you now show as a count beside Approvals.",
        action: { label: "Read the docs", href: "#announcements", external: true }
    }
];
export default function Example() {
    const [open, setOpen] = useState(false);
    const [unseen, setUnseen] = useState(items.map((item) => item.id));
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <Button variant="outline" icon="megaphone" onClick={() => setOpen(true)}>
        What&apos;s new
        {unseen.length > 0 && <Count>{unseen.length}</Count>}
      </Button>
      <Announcements items={items} open={open} onOpenChange={setOpen} onSeen={(id) => setUnseen((current) => current.filter((entry) => entry !== id))}/>
    </div><figcaption className="text-muted-foreground text-xs">{"Opened from a What's new button with its unseen count"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#announcements and exercise the documented interaction.
