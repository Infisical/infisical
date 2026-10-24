import { useState } from "react";

import { Label } from "@app/components/v4/ui/label";
import { Textarea } from "@app/components/v4/ui/textarea";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [value, setValue] = useState(
    "Staging deployment notes.\nPreserve line breaks and exact values."
  );
  return (
    <ExampleGrid>
      <ExampleCell label="Controlled">
        <Label htmlFor="textarea-draft">Draft notes</Label>
        <Textarea
          id="textarea-draft"
          rows={5}
          cols={24}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <p
          role="status"
          className="sr-only text-sm break-all whitespace-pre-wrap"
          data-textarea-value
        >
          {value}
        </p>
      </ExampleCell>
      <ExampleCell label="Read-only">
        <Label htmlFor="textarea-readonly">Saved notes</Label>
        <Textarea
          id="textarea-readonly"
          readOnly
          value={"Managed by platform policy.\nRetain this exact line break."}
        />
      </ExampleCell>
      <ExampleCell label="Empty">
        <Label htmlFor="textarea-empty">Empty notes</Label>
        <Textarea id="textarea-empty" placeholder="Describe this connection" />
      </ExampleCell>
    </ExampleGrid>
  );
}
