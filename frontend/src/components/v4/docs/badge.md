# Badge

Show a short status, version or environment beside its object.

## Choose this component

Choose Badge for compact object status and Count for a numeric total. Use Alert for an explanation and Button for an action.

## Usage rules

### badge-usage

Owner: badge.

When an environment, version and operational status appear beside the same resource.

Do: Use neutral text or a neutral Badge for category metadata. Pair status tones and dots with a real state label and its consequence.

Avoid: Color every environment or version as success, warning or failure without a corresponding state.

Why: Category and operational state answer different questions; coloring both as status hides the exception that needs attention.

Checked by: review only. Look for: Inspect labels with hue removed. Status remains understandable, while environment and version metadata do not falsely look like success or failure.

Source evidence:
- src/components/v4/ui/badge.tsx
- src/pages/design-system/examples/badge/default.tsx

### badge-status-versus-action

Owner: badge.

When a row includes status and a numeric total.

Do: Use Badge for a concise supplied status and Count for the number; keep an action in Button or a real slotted link.

Avoid: Render every metadata value as a colored badge, use a badge as an unlabeled button or invent Healthy from an absent status.

Why: Status emphasis should distinguish meaningful conditions rather than decorate every fact.

Checked by: review only. Look for: Read the row without color. Status text, totals and actions remain distinct, and each status can be traced to the supplied data.

Source evidence:
- src/components/v4/ui/badge.tsx
- src/pages/design-system/examples/badge/default.tsx

## State guidance

- long-label: Shorten the status term rather than shrinking its text.
- zero: Show a zero count only when zero is meaningful to the task.

## Presentation rules

Do: Reserve status tones for actual status.

Avoid: Add matching bright badges to every navigation label and heading.

Why: Repeated emphasis removes the distinction between ordinary metadata and an exception.

## Import and exports

- src/components/v4/ui/badge.tsx
- src/components/v4/ui/helpers.module.css

Exports: Badge, badgeVariants, Count. Source TypeScript defines the API.

## Behavior

- tone is the one paint axis: outline, soft, solid and accent for metadata and emphasis; ok, warn, bad and info for status. variant is deprecated and maps to a tone (default solid, secondary soft, destructive bad, the rest outline). Badges are 20px (md) or 16px (sm) with 4px corners and one weight, and take an optional dot and mono content. Count is a separate 20px number chip: accent for attention, ink for weight and neutral for counts inside tabs and lists.

## Accessibility

- Tone must accompany readable text; a dot alone does not explain status.

## Use cases

- Use Badge's sm or md treatment for compact status, Count for totals and quiet text for ordinary metadata.

## Limits

- Badge and Count display caller-supplied values; they do not fetch or calculate status.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant


- default: omitted. Deprecated alias of tone="solid". Use tone.
- secondary: omitted. Deprecated alias of tone="soft". Use tone.
- destructive: omitted. Deprecated alias of tone="bad". Use tone.
- outline: omitted. Deprecated alias of tone="outline". Use tone.
- ghost: omitted. Deprecated. It rendered as plain text, so it now maps to tone="outline".
- link: omitted. Deprecated. It rendered as plain text, so it now maps to tone="outline".

### tone

- outline: example `default`, visible label "outline".
- soft: example `default`, visible label "soft".
- ok: example `default`, visible label "ok".
- warn: example `default`, visible label "warn".
- bad: example `default`, visible label "bad".
- info: example `default`, visible label "info".
- solid: example `default`, visible label "solid".
- accent: example `default`, visible label "accent".

### size

- sm: example `sizes`, visible label "sm".
- md: example `sizes`, visible label "md".

### Count.tone

- accent: example `count`, visible label "accent".
- ink: example `count`, visible label "ink".
- neutral: example `count`, visible label "neutral".

### composition

- dot: example `default`, visible label "ok".
- no dot: example `default`, visible label "outline".
- mono: example `default`, visible label "soft".
- link: omitted. asChild renders the Badge as the caller's anchor with the same tone paint. Badges label things; a destination belongs in a link.

## Executable examples

### Tones

Save this example at `src/pages/design-system/examples/badge/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/badge. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Badge tone="outline">Production</Badge>
      </div><figcaption className="text-muted-foreground text-xs">{"outline"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Badge tone="soft" mono>
          v2.14.0
        </Badge>
      </div><figcaption className="text-muted-foreground text-xs">{"soft"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Badge tone="solid">Inherited</Badge>
      </div><figcaption className="text-muted-foreground text-xs">{"solid"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Badge tone="accent">New</Badge>
      </div><figcaption className="text-muted-foreground text-xs">{"accent"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Badge tone="ok" dot>
          Connected
        </Badge>
      </div><figcaption className="text-muted-foreground text-xs">{"ok"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Badge tone="warn" dot>
          Expires in 7 days
        </Badge>
      </div><figcaption className="text-muted-foreground text-xs">{"warn"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Badge tone="bad" dot>
          Unavailable
        </Badge>
      </div><figcaption className="text-muted-foreground text-xs">{"bad"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Badge tone="info" dot>
          Syncing
        </Badge>
      </div><figcaption className="text-muted-foreground text-xs">{"info"}</figcaption></figure>
    </div>);
}
```

### Sizes

Save this example at `src/pages/design-system/examples/badge/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/badge. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(["sm", "md"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <Badge size={size} tone="ok" dot>
            Connected
          </Badge>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
    </div>);
}
```

### Count

Save this example at `src/pages/design-system/examples/badge/count.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/badge. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Count } from "../../../../components/v4/ui/badge";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(["accent", "ink", "neutral"] as const).map((tone) => (<figure key={tone} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <span className="flex items-center gap-2">
            Waiting requests
            <Count tone={tone} aria-label="4 waiting requests">
              4
            </Count>
          </span>
        </div><figcaption className="text-muted-foreground text-xs">{tone}</figcaption></figure>))}
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#badge and verify the documented interaction.
