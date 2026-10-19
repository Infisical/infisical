# Switch

Apply an immediate boolean setting with its own pending and recovery state.

## Choose this component

Choose Switch for an immediately applied boolean setting. Use Checkbox when a form stages the change until Save.

## Usage rules

### switch-usage

Owner: switch.

When turning a setting on starts a request that can fail.

Do: Keep the label stable, show pending feedback, and restore or explain the actual saved state on rejection.

Avoid: Place an immediate-looking switch behind a separate Save button or leave it on after a rejected change.

Why: The switch communicates a current setting rather than an unsaved draft.

Checked by: review only. Look for: Reject an immediate setting change. The displayed saved state and error reflect the host result; an unsaved checkbox-like draft is not presented as an applied switch.

Source evidence:
- src/components/v4/ui/switch.tsx
- src/pages/design-system/examples/switch/default.tsx

## State guidance

- pending: Prevent conflicting repeated changes while the host applies the setting.
- error: Explain the failed change next to the switch and show the actual state.

## Presentation rules

Do: Name the setting, such as Audit logging.

Avoid: Change the label between Enable logging and Disable logging with every toggle.

Why: The state already communicates on or off; changing the name makes the control harder to track.

Do: Keep the saved value and a named pending result until the local operation succeeds; preserve it on rejection.

Avoid: Render the requested value as already saved or leave a pending indicator after failure.

Why: An immediate setting must reflect the actual host result and offer a usable retry.

## Import and exports

- src/components/v4/ui/switch.tsx

Exports: Switch. Source TypeScript defines the API.

## Behavior

- Switch applies an immediate boolean setting, with row layout, small size and disabled states. onChange/onCheckedChange belong to the owner. Off is a light grey track with a dimmed knob (white with a hairline in light, grey in dark); on is the accent track (sw-on) with an on-accent ink knob (sw-knob-on). Track and knob follow the corner mode: square in square mode, radius-control and half of it in soft mode. The knob slides 16px (12px at sm) on the fast motion token. Focus draws the 2px ink outline shared with checkbox and radio.

## Accessibility

- Label the switch and keep its name stable when its checked state changes. Do not stage it behind Save.

## Use cases

- Let the host represent pending, failure and rollback or retry, keep its label stable and use Checkbox when a later Save stages the value.

## Avoid

- Show the new saved state before the request resolves or combine an immediate Switch with a contradictory Save footer.

## Limits

- Switch reports boolean changes but does not persist or roll them back; the host must represent pending and failed updates truthfully.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- sm: example `sizes`, visible label "sm".
- default: example `sizes`, visible label "default".

### layout

- default: example `default`, visible label "Inline".
- row: example `default`, visible label "Row with description".

### state

- unchecked: example `states`, visible label "Off".
- checked: example `states`, visible label "On".
- disabled unchecked: example `states`, visible label "Disabled, off".
- disabled checked: example `states`, visible label "Disabled, on".
- controlled saved state: example `default`, visible label "Inline".
- invalid: omitted. aria-invalid draws the red control border. A switch is rarely a required answer; Field shows the error rendering.
- external label: omitted. An id and a Label with htmlFor. The Label page shows the association.
- pending: omitted. Switch exposes controlled checked, disabled and invalid states. Request pending and retry belong to its caller.
- failure and retry: omitted. Switch exposes controlled checked, disabled and invalid states. Request pending and retry belong to its caller.

## Executable examples

### Layouts

Save this example at `src/pages/design-system/examples/switch/default.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @infisical/switch. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Switch } from "../../../../components/v4/ui/switch";
export default function Example() {
    const [events, setEvents] = useState(true);
    const [rotation, setRotation] = useState(false);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Switch label="Audit events" checked={events} onChange={setEvents}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Inline"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Switch label="Automatic rotation" description="Rotate credentials every 30 days." layout="row" checked={rotation} onChange={setRotation}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Row with description"}</figcaption></figure>
    </div>);
}
```

### Sizes

Save this example at `src/pages/design-system/examples/switch/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/switch. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Switch } from "../../../../components/v4/ui/switch";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(["sm", "default"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <Switch size={size} label="Audit events" defaultChecked/>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
    </div>);
}
```

### States and layout

Save this example at `src/pages/design-system/examples/switch/states.tsx`; its relative imports are generated for that exact path. States: default, invalid, disabled.

Registry items used: @infisical/switch. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Switch } from "../../../../components/v4/ui/switch";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Switch aria-label="Audit events, off"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Off"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Switch aria-label="Audit events, on" defaultChecked/>
      </div><figcaption className="text-muted-foreground text-xs">{"On"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Switch aria-label="Audit events, disabled off" disabled/>
      </div><figcaption className="text-muted-foreground text-xs">{"Disabled, off"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Switch aria-label="Audit events, disabled on" disabled defaultChecked/>
      </div><figcaption className="text-muted-foreground text-xs">{"Disabled, on"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#switch and verify the documented interaction.
