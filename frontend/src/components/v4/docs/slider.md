# Slider

Choose a numeric value or range from a bounded scale.

## Choose this component

Choose Slider for an approximate bounded quantity with a visible current value. Use numeric Input when exact typed entry is the main task.

## Usage rules

### slider-usage

Owner: slider.

When a range has two thumbs with different meanings.

Do: Name each thumb distinctly, expose its current value, and commit expensive work only at the intended boundary.

Avoid: Give both thumbs the same label or persist every intermediate pointer movement without intent.

Why: The user must know which bound is changing and when it takes effect.

Checked by: review only. Look for: Adjust each thumb with keyboard and pointer. Distinct names, current numeric values, bounds and units make the changed quantity clear before it is committed.

Source evidence:
- src/components/v4/ui/slider.tsx
- src/pages/design-system/examples/slider/default.tsx

## State guidance

- dragging: Update the visible draft while preserving the chosen commit policy.
- bounds: Show the valid minimum, maximum and unit so endpoints are understandable.

## Presentation rules

Do: Use a slider where continuous adjustment helps compare outcomes.

Avoid: Use a long slider to choose a precise account ID or an arbitrary date.

Why: Those values are not approximate quantities and need a different input model.

Do: Name every thumb and distinguish the current draft from the value reported by onValueCommit.

Avoid: Give both ends the same accessible name or claim a committed value from a visual thumb movement alone.

Why: A range contains independently meaningful values and a separate commit event.

## Import and exports

- src/components/v4/ui/slider.tsx

Exports: Slider. Source TypeScript defines the API.

## Behavior

- Radix value/defaultValue is a number array; onValueChange reports live adjustment and onValueCommit reports committed adjustment. Array length determines the number of thumbs.
- The filled range and the thumb use the accent in both themes, and the thumb has a 2px on-accent ring. The thumb follows the corner mode: a square in square mode and a rounded square (radius-sm) in soft mode, never a circle. A disabled slider drops to faint and the disabled control surface.

## Accessibility

- Name each thumb with thumbLabels or aria-labelledby; with one shared label, each thumb gets that label plus its position. Each thumb announces its minimum, maximum and value, and arrow keys adjust it.

## Use cases

- Label the quantity and units, choose min/max/step deliberately and use onValueCommit only for the host's intended commit boundary.

## Avoid

- Hide the current number, save on every movement unintentionally or use a slider alone when exact entry is required.

## Limits

- The owner chooses units, rounding and when to save. A slider is approximate; provide a numeric input when exact entry matters.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### orientation

- horizontal: example `default`, visible label "Single".
- vertical: omitted. The same track and thumb on the vertical axis, for a tall side panel. It needs a fixed height.

### inverted

- false: example `default`, visible label "Single".
- true: omitted. Reverses the value direction without changing the paint.

### state

- single controlled: example `default`, visible label "Single".
- range: example `default`, visible label "Range".
- disabled: example `default`, visible label "Disabled".
- minimum spacing: example `default`, visible label "Range".
- commit callback: omitted. onValueCommit fires on release. It changes no paint, so a still example cannot show it.

## Executable examples

### Single, range and disabled

Save this example at `src/pages/design-system/examples/slider/default.tsx`; its relative imports are generated for that exact path. States: controlled, disabled, keyboard.

Registry items used: @infisical/label, @infisical/slider. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Label } from "../../../../components/v4/ui/label";
import { Slider } from "../../../../components/v4/ui/slider";
export default function Example() {
    const [days, setDays] = useState([30]);
    const [accessWindow, setAccessWindow] = useState([20, 60]);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="flex flex-col gap-2">
          <Label id="slider-retention">Retention: {days[0]} days</Label>
          <Slider value={days} onValueChange={setDays} min={1} max={90} aria-labelledby="slider-retention"/>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Single"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="flex flex-col gap-2">
          <Label id="slider-window">
            Access window: day {accessWindow[0]} to {accessWindow[1]}
          </Label>
          <Slider value={accessWindow} onValueChange={setAccessWindow} min={0} max={90} minStepsBetweenThumbs={10} thumbLabels={["Access start day", "Access end day"]}/>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Range"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="flex flex-col gap-2">
          <Label id="slider-managed">Managed retention: 30 days</Label>
          <Slider value={[30]} min={1} max={90} disabled aria-labelledby="slider-managed"/>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Disabled"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#slider and verify the documented interaction.
