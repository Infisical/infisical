# Toggle Group

Select one or several pressed options in a compact group.

## Choose this component

Choose ToggleGroup to filter or format the content in place: a segmented All / Active / Failing filter, or a set of pressed flags. Use Tabs when each choice owns its own panel, RadioGroup for a required form value and ButtonGroup for one-time actions.

## Usage rules

### toggle-group-usage

Owner: toggle-group.

When a single-choice pressed group can be toggled off.

Do: Handle the empty string as no pressed tool, or choose RadioGroup if one option must always remain selected.

Avoid: Assume single mode guarantees a required value.

Why: Optional pressed tools and required form choices have different empty-state contracts.

Checked by: review only. Look for: Turn off the selected single-mode tool and change multiple-mode tools. Empty or array values remain deliberate host states rather than an assumed required radio choice.

Source evidence:
- src/components/v4/ui/toggle-group.tsx
- src/pages/design-system/examples/toggle-group/default.tsx

## State guidance

- multiple: Store the array of pressed values without deriving unrelated permissions.
- empty: Keep the unpressed state meaningful and valid when the group allows it.

## Presentation rules

Do: Keep the tools close in purpose and label the group.

Avoid: Use pressed buttons as a substitute for every form select.

Why: A compact toolbar is useful for repeated tools, not arbitrary long option lists.

Do: Compare authored variants and sizes with the same short choices, then show single and multiple selection independently.

Avoid: Build every combination or silently erase a selected policy-disabled permission.

Why: Comparable geometry and controlled selection are separate behaviors.

## Import and exports

- src/components/v4/ui/toggle-group.tsx

Exports: ToggleGroup, ToggleGroupItem. Source TypeScript defines the API.

## Behavior

- Radix type=single uses a string and type=multiple uses a string array with onValueChange. Items are joined into one segmented control by default (spacing 0), drawn like segmented Tabs: a tint track with 2px inset, borderless segments 4px shorter than the requested size, and the on item as the same raised chip as the segmented Tabs indicator. bare drops the track so the segments can sit on a track the host already draws, such as a floating dock; the host supplies the tint and padding. spacing={n} separates the items by n times 4px as standalone Toggles with the pressed fill. Shared size, variant and orientation apply to the group; sizes follow Button.

## Accessibility

- Name the group and each item. Each item announces whether it is pressed, arrow keys move between items and disabled items stay unavailable.

## Use cases

- Pass a string for single and an array for multiple, handle empty values deliberately and apply variant and size at the group owner.

## Avoid

- Use radio assumptions for a single group or erase a selected disabled option when another tool changes.

## Limits

- Single mode may report an empty string when deselected; multiple mode may report an empty array. Enforce any required choice in the host.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant


- outline: omitted. The default. Both examples use it: joined bordered segments.
- default: omitted. Alias of outline, as on Toggle.
- ghost: omitted. Borderless segments for a toolbar that already frames them. The Toggle page shows the ghost paint.

### size


- default: omitted. ToggleGroup uses the Button size scale. Both groups here are the 32px default.
- sm: omitted. Alias of default, as on Button.
- md: omitted. 36px, the Button md geometry.
- lg: omitted. 40px, the Button lg geometry.

### type

- single: example `default`, visible label "single".
- multiple: example `permissions`, visible label "multiple".

### orientation

- horizontal: example `default`, visible label "single".
- vertical: omitted. The same joined segments stacked, for a narrow side panel.

### state

- uncontrolled: example `default`, visible label "single".
- controlled: example `permissions`, visible label "multiple".
- disabled selected: example `permissions`, visible label "multiple".
- zero spacing: example `default`, visible label "single".
- spaced: omitted. spacing={n} separates the items by n times 4px, each with its own corners. Use it only when the items are not one control.

## Executable examples

### Single choice

Save this example at `src/pages/design-system/examples/toggle-group/default.tsx`; its relative imports are generated for that exact path. States: default, keyboard.

Registry items used: @infisical/toggle-group. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { ToggleGroup, ToggleGroupItem } from "../../../../components/v4/ui/toggle-group";
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <ToggleGroup type="single" defaultValue="all" aria-label="Connection status">
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="active">Active</ToggleGroupItem>
        <ToggleGroupItem value="failing">Failing</ToggleGroupItem>
      </ToggleGroup>
    </div><figcaption className="text-muted-foreground text-xs">{"single"}</figcaption></figure>);
}
```

### Multiple choices

Save this example at `src/pages/design-system/examples/toggle-group/permissions.tsx`; its relative imports are generated for that exact path. States: controlled, disabled, keyboard.

Registry items used: @infisical/toggle-group. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "../../../../components/v4/ui/toggle-group";
export default function Example() {
    const [values, setValues] = useState(["read", "admin"]);
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <ToggleGroup type="multiple" value={values} onValueChange={setValues} aria-label="Permission flags">
        <ToggleGroupItem value="read" aria-label="Read permission">
          Read
        </ToggleGroupItem>
        <ToggleGroupItem value="write" aria-label="Write permission">
          Write
        </ToggleGroupItem>
        <ToggleGroupItem value="admin" aria-label="Administrator permission" disabled>
          Admin
        </ToggleGroupItem>
      </ToggleGroup>
    </div><figcaption className="text-muted-foreground text-xs">{"multiple"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#toggle-group and verify the documented interaction.
