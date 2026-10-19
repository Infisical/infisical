import { useState } from "react";

import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v4/ui/input-group";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const SizedField = ({ size }: { size: "sm" | "md" | "lg" }) => {
  const [value, setValue] = useState("/payments");
  return (
    <ExampleCell label={size}>
      <Field label={`${size} path`}>
        <InputGroup size={size}>
          <InputGroupAddon>
            <Icon name="search" />
          </InputGroupAddon>
          <InputGroupInput value={value} onChange={(event) => setValue(event.target.value)} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="sm" disabled={!value} onClick={() => setValue("")}>
              Clear
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </ExampleCell>
  );
};

export default function Example() {
  return (
    <ExampleGrid>
      {(["sm", "md", "lg"] as const).map((size) => (
        <SizedField key={size} size={size} />
      ))}
    </ExampleGrid>
  );
}
