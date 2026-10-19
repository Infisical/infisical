# Item

Arrange one object with its title, description, media and actions.

## Choose this component

Choose Item for one object with rich title, metadata, media and actions. Use List for a managed collection and DataTable for column comparison.

## Usage rules

### item-usage

Owner: item.

When a row has both a main destination and secondary controls.

Do: Use a native title link or button for the main action and a separately named target for each secondary action.

Avoid: Wrap the complete row in a button containing other buttons or links.

Why: Distinct native targets let people open, select and act on an object without one click triggering a different action.

Checked by: review only. Look for: Tab through the item's main action and its secondary controls; each has a distinct name and activating one does not trigger another.

Source evidence:
- src/components/v4/ui/item.tsx
- src/pages/design-system/examples/item/default.tsx

### item-content-and-actions

Owner: item.

When an object preview includes title, metadata and independent actions.

Do: Use title, description, badge, meta and actions slots; choose actionsPlacement=below when neighboring content needs more width.

Avoid: Concatenate a title and count into an anonymous string or slot a whole row into a link that contains another action button.

Why: Explicit slots preserve readable relationships and prevent nested interactive targets.

Checked by: review only. Look for: Compare long titles, metadata and actions at narrow width. Each action remains independently reachable and selected or unread treatment follows actual host state.

Source evidence:
- src/components/v4/ui/item.tsx
- src/pages/design-system/examples/item/default.tsx

## State guidance

- error: Place the error with the affected item rather than replacing unrelated list content.
- long-title: Choose truncation only when the full identifier remains available through an intentional route.

## Presentation rules

Do: Allocate media, metadata and actions according to the object's task.

Avoid: Populate every slot with an icon, badge and decorative description by default.

Why: Optional slots should carry information, not force every object into a noisy template.

## Import and exports

- src/components/v4/ui/item.tsx
- src/components/v4/ui/item.module.css
- src/components/v4/ui/helpers.module.css

Exports: Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemHeader, ItemMedia, ItemSeparator, ItemTitle, Media, Tile. Source TypeScript defines the API.

## Behavior

- Item composes rows with title, media, metadata, actions, error/unread states and actions below the text. ItemGroup keeps the requested semantic wrapper; Tile is a native selected button.

## Accessibility

- Make only actionable rows interactive. Name a selected Tile and preserve aria-pressed instead of adding click handlers to a generic div.

## Use cases

- Use Item for one rich object with named content slots. Choose List when collection identity and selection need a shared owner.

## Limits

- ItemGroup supplies list/listitem structure and preserves slotted links; selection, unread counts and operations remain caller-owned.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- default: example `variants`, visible label "default".
- outline: example `variants`, visible label "outline".
- muted: example `variants`, visible label "muted".

### size

- default: example `variants`, visible label "default, md".
- md: example `variants`, visible label "default, md"; alias of default.
- sm: example `variants`, visible label "sm".
- xs: example `variants`, visible label "xs".

### state

- unread: example `default`, visible label "Deployment service".
- resolved: example `variants`, visible label "Resolved, full text".
- error: example `default`, visible label "Token needs attention".
- selected: example `tiles`, visible label "Machine identity".
- disabled: example `variants`, visible label "Disabled selection".

### Media.tone

- ok: example `variants`, visible label "ok".
- warn: example `variants`, visible label "warn".
- bad: example `variants`, visible label "bad".
- info: example `variants`, visible label "info".

### Media.size

- sm: example `composition`, visible label "sm".
- md: example `composition`, visible label "md".

### ItemMedia.variant

- default: example `composition`, visible label "default".
- icon: example `composition`, visible label "icon".
- image: example `composition`, visible label "image".

## Executable examples

### Unread rows, errors and a selectable provider

Save this example at `src/pages/design-system/examples/item/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/badge, @infisical/button, @infisical/item. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Item, ItemGroup, Media, Tile } from "../../../../components/v4/ui/item";
export default function Example() {
    const [selected, setSelected] = useState(false);
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <ItemGroup>
        <Item title="Deployment service" description="Read access to production secrets." media={<Media icon="machine"/>} badge={<Badge tone="ok" dot>
              Active
            </Badge>} meta="2 minutes ago" unread actions={<Button asChild variant="outline">
              <a href="#radio-group">View access guide</a>
            </Button>}/>
        <Item title="Token needs attention" description="Its provider scope no longer permits reads." icon="alert" error="Update the token scope to reconnect." actionsPlacement="below" actions={<Button asChild variant="outline">
              <a href="#input">Provider settings</a>
            </Button>}/>
      </ItemGroup>
      <Tile title="Vault provider" description="Connect an existing vault." media={<Media icon="lock"/>} selected={selected} onClick={() => setSelected(!selected)}/>
    </div>);
}
```

### Variants, sizes and states

Save this example at `src/pages/design-system/examples/item/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/item. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Item, Media, Tile } from "../../../../components/v4/ui/item";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      {(["default", "outline", "muted"] as const).map((variant) => (<figure key={variant} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Item variant={variant} title="Deployment service" description="Read access to staging"/>
        </div><figcaption className="text-muted-foreground text-xs">{variant}</figcaption></figure>))}
      {([
            ["default", "default, md"],
            ["sm", "sm"],
            ["xs", "xs"]
        ] as const).map(([size, label]) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Item size={size} title="Deployment service" description="Read access to staging"/>
        </div><figcaption className="text-muted-foreground text-xs">{label}</figcaption></figure>))}
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Item title="applications/staging/services/payment-processing/configuration" description="Versions synchronized successfully" resolved truncate={false} mono actionsPlacement="below" actions={<Button asChild variant="outline">
              <a href="#code">View configuration guide</a>
            </Button>}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Resolved, full text"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Tile title="Managed vault" description="Connection managed by the organization" disabled selected={false}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Disabled selection"}</figcaption></figure>
      <div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
        {(["ok", "warn", "bad", "info"] as const).map((tone) => (<figure key={tone} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
            <Media tone={tone} icon="lock" size="sm"/>
          </div><figcaption className="text-muted-foreground text-xs">{tone}</figcaption></figure>))}
      </div>
    </div>);
}
```

### Parts and media

Save this example at `src/pages/design-system/examples/item/composition.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/icon, @infisical/item. Additional packages: lucide-react@^0.544.0. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileText } from "lucide-react";
import { Button } from "../../../../components/v4/ui/button";
import { Icon } from "../../../../components/v4/ui/icon";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle, Media } from "../../../../components/v4/ui/item";
const manifestImage = `data:image/svg+xml,${encodeURIComponent(renderToStaticMarkup(<FileText xmlns="http://www.w3.org/2000/svg" color="CanvasText"/>))}`;
export default function Example() {
    const [imageAvailable, setImageAvailable] = useState(true);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Item variant="outline">
          <ItemMedia variant="icon">
            <Icon name="key"/>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Staging service</ItemTitle>
            <ItemDescription>Read access to project versions</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button asChild variant="outline">
              <a href="#input">View settings</a>
            </Button>
          </ItemActions>
        </Item>
      </div><figcaption className="text-muted-foreground text-xs">{"Explicit parts"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        {(["default", "icon", "image"] as const).map((variant) => (<figure key={variant} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
            <Item variant="outline">
              <ItemMedia variant={variant}>
                {variant === "default" && <span>ENV</span>}
                {variant === "icon" && <Icon name="file"/>}
                {variant === "image" &&
                (imageAvailable ? (<img src={manifestImage} alt="Staging deployment manifest thumbnail" onError={() => setImageAvailable(false)}/>) : (<Icon name="file" label="Manifest preview unavailable"/>))}
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Staging deployment manifest</ItemTitle>
                <ItemDescription>Environment configuration, staging.env</ItemDescription>
              </ItemContent>
            </Item>
          </div><figcaption className="text-muted-foreground text-xs">{variant}</figcaption></figure>))}
        {!imageAvailable && (<p role="status" className="sr-only">
            Manifest preview unavailable
          </p>)}
      </div><figcaption className="text-muted-foreground text-xs">{"ItemMedia recipes"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
          {(["sm", "md", 24] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
              <Media icon="key" size={size}/>
            </div><figcaption className="text-muted-foreground text-xs">{typeof size === "number" ? `${size}px` : size}</figcaption></figure>))}
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Media sizes"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Item asChild>
          <a href="#input">
            <ItemContent>
              <ItemTitle>Input guide</ItemTitle>
              <ItemDescription>Provider configuration controls</ItemDescription>
            </ItemContent>
          </a>
        </Item>
      </div><figcaption className="text-muted-foreground text-xs">{"Linked row"}</figcaption></figure>
    </div>);
}
```

### Selectable tile and media

Save this example at `src/pages/design-system/examples/item/tiles.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @infisical/item. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Media, Tile } from "../../../../components/v4/ui/item";
export default function Example() {
    const [selected, setSelected] = useState(false);
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <Tile selected={selected} onClick={() => setSelected(!selected)}>
        <span className="flex items-center gap-3">
          <Media icon="machine"/>
          Machine identity
        </span>
      </Tile>
      <p role="status" className="sr-only">
        {selected ? "Machine identity selected" : "No identity selected"}
      </p>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#item and verify the documented interaction.
