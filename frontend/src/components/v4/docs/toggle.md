# Toggle

Turn a single pressed state on or off.

## Choose this component

Choose Toggle for an optional pressed view or formatting choice. Use Switch for an immediately persisted setting and Button for a one-time action.

## Usage rules

### toggle-usage

Owner: toggle.

When a preview can be shown or hidden without changing saved data.

Do: Keep the name Show preview stable and express the state through pressed state.

Avoid: Rename the control after every press or claim that changing view state saved a preference.

Why: A stable action name and pressed state make the same control easy to track.

Checked by: review only. Look for: Toggle the preview twice. The control name stays stable, pressed state agrees with the visible preview and no one-time action remains falsely pressed.

Source evidence:
- src/components/v4/ui/toggle.tsx
- src/pages/design-system/examples/toggle/default.tsx

## State guidance

- pressed: Keep the associated preview consistent with the controlled state.
- disabled: Retain the reason the optional tool is unavailable nearby.

## Presentation rules

Do: Use persistent pressed styling only for persistent choices.

Avoid: Leave a one-time Copy action visually pressed after it succeeds.

Why: Pressed appearance implies a continuing mode that copying does not create.

Do: Use a stable task label and make the pressed state control actual visible content.

Avoid: Change only the paint while claiming that details were shown or use generic Submit labels.

Why: The pressed value needs an observable purpose beyond a state attribute.

## Import and exports

- src/components/v4/ui/toggle.tsx

Exports: Toggle, toggleVariants. Source TypeScript defines the API.

## Behavior

- Radix pressed/defaultPressed and onPressedChange model one independent boolean choice. Off is a bordered control on the surface (outline, the default). Hover tints it. On fills it with the shared selected paint, a darker neutral with a stronger border, so hover never reads as pressed. ghost drops the off border for a dense toolbar. Sizes follow Button: default and sm 32px, md 36px, lg 40px. An icon-only Toggle is square.

## Accessibility

- Use a stable accessible name and let aria-pressed communicate state. Keep a visible focus indicator and disabled semantics.

## Use cases

- Keep its accessible name stable and let aria-pressed describe the state. Use outline unless the row already frames the tools, then ghost.

## Avoid

- Change the label from Enable X to Disable X without a consistent name or use a pressed tool to imply a saved preference.

## Limits

- Pressed state does not save a preference by itself; the owner chooses whether the choice is immediate or local to a view.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- outline: example `variants`, visible label "outline".
- ghost: example `variants`, visible label "ghost".
- default: omitted. Alias of outline, kept so existing callers keep a bordered Toggle.

### size


- default: omitted. Toggle uses the Button size scale. Every Toggle on this page is the 32px default.
- sm: omitted. Alias of default, as on Button.
- md: omitted. 36px, the Button md geometry. The Button page compares sizes.
- lg: omitted. 40px, the Button lg geometry. The Button page compares sizes.

### state

- controlled: example `default`, visible label "Text, on".
- uncontrolled pressed: example `default`, visible label "Icon, on".
- disabled: omitted. 50% opacity and no pointer events, the same as a disabled Button.
- invalid: omitted. aria-invalid draws the red control border. A Toggle is rarely a required answer; use a field for that.

## Executable examples

### Off and on

Save this example at `src/pages/design-system/examples/toggle/default.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @infisical/icon, @infisical/toggle. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Icon } from "../../../../components/v4/ui/icon";
import { Toggle } from "../../../../components/v4/ui/toggle";
export default function Example() {
    const [metadata, setMetadata] = useState(true);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Toggle>Metadata</Toggle>
      </div><figcaption className="text-muted-foreground text-xs">{"Text, off"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Toggle pressed={metadata} onPressedChange={setMetadata}>
          Metadata
        </Toggle>
      </div><figcaption className="text-muted-foreground text-xs">{"Text, on"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Toggle aria-label="Show values">
          <Icon name="eye"/>
        </Toggle>
      </div><figcaption className="text-muted-foreground text-xs">{"Icon, off"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Toggle aria-label="Show values" defaultPressed>
          <Icon name="eye"/>
        </Toggle>
      </div><figcaption className="text-muted-foreground text-xs">{"Icon, on"}</figcaption></figure>
    </div>);
}
```

### Variants

Save this example at `src/pages/design-system/examples/toggle/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/icon, @infisical/toggle. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Icon } from "../../../../components/v4/ui/icon";
import { Toggle } from "../../../../components/v4/ui/toggle";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(["outline", "ghost"] as const).map((variant) => (<figure key={variant} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <div className="flex gap-2">
            <Toggle variant={variant} aria-label="Show history">
              <Icon name="history"/>
            </Toggle>
            <Toggle variant={variant} aria-label="Show values" defaultPressed>
              <Icon name="eye"/>
            </Toggle>
          </div>
        </div><figcaption className="text-muted-foreground text-xs">{variant}</figcaption></figure>))}
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#toggle and verify the documented interaction.
