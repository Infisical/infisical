import { useState } from "react";

import { ColorPicker, tagColorPresets } from "@app/components/v4/ui/color-picker";
import { Field } from "@app/components/v4/ui/field";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const hexColor = /^#[0-9a-f]{6}$/i;

export default function Example() {
  const [tag, setTag] = useState(tagColorPresets[3].value);
  const [custom, setCustom] = useState("#14324a"); // v4-check-ignore raw-color -- a custom stored value outside the presets
  const [empty, setEmpty] = useState("");
  const [typo, setTypo] = useState("#12345"); // v4-check-ignore raw-color -- an incomplete hex value
  const [brand, setBrand] = useState("#f4f1ea"); // v4-check-ignore raw-color -- a stored brand color
  return (
    <ExampleGrid>
      <ExampleCell label="Tag color">
        <Field label="Color">
          <ColorPicker value={tag} onChange={setTag} presets={tagColorPresets} />
        </Field>
      </ExampleCell>
      <ExampleCell label="Custom value">
        <Field label="Color">
          <ColorPicker value={custom} onChange={setCustom} presets={tagColorPresets} />
        </Field>
      </ExampleCell>
      <ExampleCell label="Empty">
        <Field label="Color" optional>
          <ColorPicker value={empty} onChange={setEmpty} presets={tagColorPresets} />
        </Field>
      </ExampleCell>
      <ExampleCell label="Invalid">
        <Field label="Color" error={hexColor.test(typo) ? undefined : "Use a six-digit hex color"}>
          <ColorPicker value={typo} onChange={setTypo} presets={tagColorPresets} />
        </Field>
      </ExampleCell>
      <ExampleCell label="Disabled">
        <Field label="Color">
          <ColorPicker value={tag} onChange={setTag} presets={tagColorPresets} disabled />
        </Field>
      </ExampleCell>
      <ExampleCell label="No presets, preview only">
        <Field label="Secondary color">
          <ColorPicker value={brand} onChange={setBrand} />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
