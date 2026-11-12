# Color picker

A hex color field with a swatch that opens a palette of preset colors.

## Choose this component

Choose ColorPicker when the stored value is a hex color. Use Select or RadioGroup when the choice is a named option whose color is only decoration.

## Usage rules

### color-picker-named-presets

Owner: color-picker.

When a surface offers preset colors.

Do: Pass presets with a human name for each color, such as tagColorPresets.

Avoid: Pass bare hex values or label swatches with their hex.

Why: The name is each swatch's accessible name, so a palette of hex values reads as noise.

Checked by: review only. Look for: Every presets entry has a name that is a word, not a hex value.

Source evidence:
- src/components/v4/ui/color-picker.tsx
- src/pages/design-system/examples/color-picker/default.tsx

## State guidance

- empty: The swatch is hatched and the placeholder shows the hex format.
- invalid: Pass invalid with the Field error; the swatch stays hatched until the value parses.
- disabled: The field and the swatch button are both disabled.

## Presentation rules

Do: Keep one palette per kind of value, so the same tag color looks the same everywhere.

Avoid: Invent a new palette for each screen.

Why: Colors a person chose on one page must match on every other page that shows them.

## Import and exports

- src/components/v4/ui/color-picker.tsx
- src/components/v4/ui/color-picker.module.css

Exports: ColorPicker, tagColorPresets. Source TypeScript defines the API.

## Behavior

- value is the hex text as typed and onChange receives every edit and every preset pick, so the caller validates it the same way it validates any field. The swatch shows the value only when it is a six-digit hex color and is hatched otherwise.
- presets is a list of { name, value }. With presets, the swatch is a button that opens a popover palette; without them the swatch is a plain preview. tagColorPresets is the palette main offers for secret tags.
- Picking a preset with the pointer sets the value and closes the palette. Arrow keys move through the palette and select as they go, Space selects, and Escape closes it and returns focus to the swatch.
- The field takes every Input prop except mono, icon, kbd and trailing: the value is always mono and the trailing slot holds the swatch. disabled or readOnly also disables the swatch button.

## Accessibility

- The palette is a Radix radio group named Preset colors with one tab stop; each swatch's accessible name is its preset name, so a screen reader never hears only a hex value.
- The swatch button is named Preset colors and adds the selected preset's name when the value matches one.
- Label the field with Field, which links the label and error to the input.

## Use cases

- Use ColorPicker for a stored color a person picks, such as a tag color or a brand color.

## Avoid

- Do not pair an Input with a hand-built swatch or a native color input.

## Limits

- There is no free-form picker surface (hue and saturation). Colors outside the presets are typed as hex.
- Only six-digit hex values preview. Three-digit and eight-digit forms are left for the caller's validation to reject.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### presets

- with presets: example `default`, visible label "Tag color".
- without presets: example `default`, visible label "No presets, preview only".

## Executable examples

### Tag colors, custom value and states

Save this example at `src/pages/design-system/examples/color-picker/default.tsx`; its relative imports are generated for that exact path. States: default, empty, invalid, disabled, keyboard.

Registry items used: @cipher/color-picker, @cipher/field. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { ColorPicker, tagColorPresets } from "../../../../components/v4/ui/color-picker";
import { Field } from "../../../../components/v4/ui/field";

const hexColor = /^#[0-9a-f]{6}$/i;

export default function Example() {
  const [tag, setTag] = useState(tagColorPresets[3].value);
  const [custom, setCustom] = useState("#14324a"); // v4-check-ignore raw-color -- a custom stored value outside the presets
  const [empty, setEmpty] = useState("");
  const [typo, setTypo] = useState("#12345"); // v4-check-ignore raw-color -- an incomplete hex value
  const [brand, setBrand] = useState("#f4f1ea"); // v4-check-ignore raw-color -- a stored brand color
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Field label="Color">
            <ColorPicker value={tag} onChange={setTag} presets={tagColorPresets} />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Tag color"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Field label="Color">
            <ColorPicker value={custom} onChange={setCustom} presets={tagColorPresets} />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Custom value"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Field label="Color" optional>
            <ColorPicker value={empty} onChange={setEmpty} presets={tagColorPresets} />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Empty"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Field
            label="Color"
            error={hexColor.test(typo) ? undefined : "Use a six-digit hex color"}
          >
            <ColorPicker value={typo} onChange={setTypo} presets={tagColorPresets} />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Invalid"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Field label="Color">
            <ColorPicker value={tag} onChange={setTag} presets={tagColorPresets} disabled />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Disabled"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Field label="Secondary color">
            <ColorPicker value={brand} onChange={setBrand} />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"No presets, preview only"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: In both schemes, open the palette with the pointer and the keyboard, arrow through it, pick a preset and check the field value and swatch.
