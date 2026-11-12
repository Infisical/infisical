# Duration input

Enter a length of time as an amount and a unit, in the ms() string main sends.

## Choose this component

Choose DurationInput when the API takes an ms() duration string. Use a number Input with its own unit Select only when the API stores seconds or another number, and Calendar or a date field for a point in time.

## Usage rules

### duration-input-ms-string

Owner: duration-input.

When a form sends a duration such as temporaryRange or maxTimePeriod to an API that parses it with ms().

Do: Bind value and onChange to the one string field, validate it with ms() in the host, and pass invalid with the Field error.

Avoid: Rebuild the string from a separate amount and unit, or accept free text that ms() reads differently from what the person meant.

Why: The string is the API contract main already sends; a second format drifts from it and free text hides typos until the request fails.

Checked by: review only. Look for: Type an amount and change the unit, then read the bound value: it is the amount followed by one of s, m, h, d or w, and an empty amount gives an empty string.

Source evidence:
- src/components/v4/ui/duration-input.tsx
- src/pages/design-system/examples/duration-input/default.tsx

## State guidance

- empty: Keep the unit on Hours or the last choice so the next keystroke forms a full value.
- invalid: Say what to change in the Field error, such as Enter a duration greater than 0.

## Presentation rules

Do: Show the policy limit in the Field description or error, in the policy's own words.

Avoid: Clamp the amount silently or swap the unit behind the person's back.

Why: A silent change grants a different duration from the one the person asked for.

## Import and exports

- src/components/v4/ui/duration-input.tsx
- src/components/v4/ui/duration-input.module.css

Exports: DurationInput, DurationInputProps, DurationUnit. Source TypeScript defines the API.

## Behavior

- Controlled: value and onChange(value: string) carry the same string main's v3 DurationInput sends for access request durations and policy time periods: the amount followed by s, m, h, d or w, such as 1h, 30m, 7d or 1.5h. Clearing the amount emits an empty string. Pass the value to the API as it is.
- The amount is a native number Input (decimal input mode, min 0.001, any step) and the unit is a Select of Seconds, Minutes, Hours, Days and Weeks, side by side at the 32px control height. A new field starts on Hours. Changing the unit with an amount emits the new string at once; with no amount it only sets the unit for the next keystroke.
- A value it cannot split, such as 1 hour, shows an empty amount. A bare number is read as milliseconds and shown in the largest whole unit, like main, for values saved before units were required.
- invalid draws the invalid border on both controls, and so does the error of a surrounding Field. disabled disables both.

## Accessibility

- Label it with Field or aria-label. The pair sits in a group named by that label; the amount takes the label as its name and the unit takes the label plus unit, so Field label Duration reads as Duration and Duration unit. Without either it falls back to Duration.
- Field's id, description and error attach to the amount, so clicking the label focuses the amount and the error is read with it.

## Use cases

- Use DurationInput for a length of time a person types, such as an access request duration, a policy's max time period or a request expiration, and send its value straight to the API.

## Avoid

- Ask for a duration in a free text Input with a placeholder like 1h, or keep the amount and unit as two fields in form state.

## Limits

- Validation belongs to the host, as in main: check that ms() parses the value to more than 0 (parseAccessDurationMs) and compare it with a policy's maxTimePeriod there, and pass invalid with the Field error.
- Units are fixed to seconds through weeks. There is no permanent or never option; pair it with a Checkbox or Switch the way the access request form does, and send no duration when access is permanent.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### state

- controlled: example `default`, visible label "Controlled".
- empty: example `default`, visible label "Empty".
- invalid: example `default`, visible label "Invalid".
- disabled: example `default`, visible label "Disabled".

## Executable examples

### States

Save this example at `src/pages/design-system/examples/duration-input/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, empty, invalid, disabled.

Registry items used: @cipher/duration-input, @cipher/field. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { DurationInput } from "../../../../components/v4/ui/duration-input";
import { Field } from "../../../../components/v4/ui/field";

export default function Example() {
  const [duration, setDuration] = useState("1h");
  const [empty, setEmpty] = useState("");
  const [invalid, setInvalid] = useState("0m");
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Field label="Duration">
            <DurationInput value={duration} onChange={setDuration} />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {duration ? `Controlled, value ${duration}` : "Controlled, value empty"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Field label="Request expiration" optional>
            <DurationInput value={empty} onChange={setEmpty} placeholder="72" />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Empty"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Field label="Duration" error="Enter a duration greater than 0.">
            <DurationInput value={invalid} onChange={setInvalid} invalid />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Invalid"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Field label="Max time period">
            <DurationInput value="7d" onChange={() => undefined} disabled />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Disabled"}</figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: Open /design-system/components/forms/duration-input, type an amount, change the unit and clear it in both themes.
