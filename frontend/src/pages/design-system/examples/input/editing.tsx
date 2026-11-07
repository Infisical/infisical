import { useState } from "react";

import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [value, setValue] = useState("/services/payments");
  return (
    <ExampleGrid>
      <ExampleCell label="Filled">
        <Field label="Draft path">
          <Input
            aria-label="Draft path"
            icon="search"
            mono
            kbd="⌘ K"
            trailing="path"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
      </ExampleCell>
      <p role="status" className="sr-only text-sm break-all whitespace-pre-wrap" data-draft-value>
        {value}
      </p>
      <ExampleCell label="Filled">
        <Field label="Native width hint" description="Short internal identifier.">
          <Input size={12} defaultValue="staging" />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
