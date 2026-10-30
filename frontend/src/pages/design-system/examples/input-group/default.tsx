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

export default function Example() {
  const [query, setQuery] = useState("payments");
  return (
    <ExampleGrid>
      <ExampleCell label="Editable with clear action">
        <Field label="Filter secrets">
          <InputGroup>
            <InputGroupAddon>
              <Icon name="search" />
            </InputGroupAddon>
            <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton onClick={() => setQuery("")} disabled={!query}>
                Clear
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </ExampleCell>
      <p role="status" className="sr-only text-sm">
        Filter: {query || "all secrets"}
      </p>
      <ExampleCell label="Invalid">
        <Field label="Required path" error="Choose an absolute path.">
          <InputGroup invalid>
            <InputGroupInput defaultValue="relative" />
          </InputGroup>
        </Field>
      </ExampleCell>
      <ExampleCell label="Read-only">
        <Field label="Managed path">
          <InputGroup>
            <InputGroupInput readOnly value="/policy" />
          </InputGroup>
        </Field>
      </ExampleCell>
      <ExampleCell label="Disabled">
        <Field label="Unavailable path">
          <InputGroup>
            <InputGroupInput disabled defaultValue="/archived" />
          </InputGroup>
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
