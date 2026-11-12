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

### badge-control-height

Owner: badge.

When a badge shares a row or grid track with regular-height controls: an Input, Select or Button.

Do: Give it the control height: the control size that matches its neighbors (control-sm beside the default 32px Input and Button, control-md beside md, control-lg beside lg).

Avoid: A 20px md Badge floating in a 32px row, or a page-local span that copies the input's height and padding.

Why: A badge that shares a row or grid track with regular-height controls takes the control height, so the row reads as one band and its glyphs and text center on one line.

Checked by: review only. Look for: Measure each row that mixes a Badge with an Input, Select or Button: the badge's box is the same height as the controls. Status chips inside text, table cells and a field's nested slot keep sm or md.

Source evidence:
- src/components/v4/ui/badge.tsx
- src/pages/design-system/examples/badge/control-height.tsx

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
- src/components/v4/tokens.json

Exports: Badge, badgeVariants, Count. Source TypeScript defines the API.

## Behavior

- tone is the one paint axis: outline, soft, solid and accent for metadata and emphasis; ok, warn, bad and info for status. variant is deprecated and maps to a tone (default solid, secondary soft, destructive bad, the rest outline). Compact badges are 20px (md) or 16px (sm) with square corners and one weight, and take an optional dot and mono content. A leading or trailing glyph is sized by Badge from its size: size-badge-glyph (14px) in the 20px md badge and size-badge-glyph-sm (12px) in the 16px sm badge, so a glyph never fills the space inside the border; callers pass the Icon without a size. Count is a separate 20px number chip: accent for attention, ink for weight and neutral for counts inside tabs and lists.
- md (20px) stays the default compact badge for status inside text, table cells and a field's nested slot. The control sizes match the row the badge shares with regular-height controls, named after the Input and Button size they sit beside: control-sm is size-control-sm (32px) with space-control-inline-sm padding and a size-icon-sm glyph, control-md is size-control-md (36px) with space-control-inline-md and a size-icon glyph, and control-lg is size-control-lg (40px) with space-control-inline and a size-icon glyph. Control badges take the body type role an Input value uses and the space-control-gap between glyph and label, and center text and glyph vertically in the full height.

## Accessibility

- Tone must accompany readable text; a dot alone does not explain status.

## Use cases

- Use Badge's sm or md treatment for compact status, Count for totals and quiet text for ordinary metadata.
- Use a control size (control-sm, control-md or control-lg, matching the Input or Button size beside it) when the badge shares a row or grid track with regular-height controls, such as a source field in FieldMapping.

## Avoid

- A page-local span sized to look like a badge at input height, or a compact badge stretched with caller height and padding classes.

## Limits

- mono is for a machine value in a Badge, such as a key ID, a version hash or a key=value metadata pair; a role, environment or status name stays in the sans (rule/mono-machine-values).
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
- control-sm: example `control-height`, visible label "control-sm".
- control-md: example `control-height`, visible label "control-md".
- control-lg: example `control-height`, visible label "control-lg".

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

Registry items used: @cipher/badge. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Badge tone="outline">Production</Badge>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"outline"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Badge tone="soft" mono>
            v2.14.0
          </Badge>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"soft"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Badge tone="solid">Inherited</Badge>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"solid"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Badge tone="accent">New</Badge>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"accent"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Badge tone="ok" dot>
            Connected
          </Badge>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"ok"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Badge tone="warn" dot>
            Expires in 7 days
          </Badge>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"warn"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Badge tone="bad" dot>
            Unavailable
          </Badge>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"bad"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <Badge tone="info" dot>
            Syncing
          </Badge>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"info"}</figcaption>
      </figure>
    </div>
  );
}
```

### Sizes

Save this example at `src/pages/design-system/examples/badge/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/badge. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      {(["sm", "md"] as const).map((size) => (
        <figure
          key={size}
          className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center"
        >
          <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
            <Badge size={size} tone="ok" dot>
              Connected
            </Badge>
          </div>
          <figcaption className="text-muted-foreground text-xs">{size}</figcaption>
        </figure>
      ))}
    </div>
  );
}
```

### Control height

Save this example at `src/pages/design-system/examples/badge/control-height.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/badge, @cipher/button, @cipher/icon, @cipher/input, @cipher/layout. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Icon } from "../../../../components/v4/ui/icon";
import { Input } from "../../../../components/v4/ui/input";
import { Inline } from "../../../../components/v4/ui/layout";

const rows = [
  { label: "md (default), beside a 32px row", badge: "md", control: "sm", button: "default" },
  {
    label: "control-sm, beside Input sm and Button default",
    badge: "control-sm",
    control: "sm",
    button: "default"
  },
  {
    label: "control-md, beside Input md and Button md",
    badge: "control-md",
    control: "md",
    button: "md"
  },
  {
    label: "control-lg, beside Input lg and Button lg",
    badge: "control-lg",
    control: "lg",
    button: "lg"
  }
] as const;

export default function Example() {
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-6">
      {rows.map((row) => (
        <figure key={row.badge} className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
            <Inline gap={8} wrap={false}>
              <Badge tone="soft" size={row.badge}>
                <Icon name="key" />
                Access key ID
              </Badge>
              <Input
                size={row.control}
                mono
                aria-label={`Secret name, ${row.badge}`}
                defaultValue="AWS_ACCESS_KEY_ID"
              />
              <Button variant="outline" size={row.button}>
                Generate
              </Button>
            </Inline>
          </div>
          <figcaption className="text-muted-foreground text-xs">{row.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
```

### Count

Save this example at `src/pages/design-system/examples/badge/count.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/badge. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Count } from "../../../../components/v4/ui/badge";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      {(["accent", "ink", "neutral"] as const).map((tone) => (
        <figure
          key={tone}
          className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center"
        >
          <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
            <span className="flex items-center gap-2">
              Waiting requests
              <Count tone={tone} aria-label="4 waiting requests">
                4
              </Count>
            </span>
          </div>
          <figcaption className="text-muted-foreground text-xs">{tone}</figcaption>
        </figure>
      ))}
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#badge and verify the documented interaction.
