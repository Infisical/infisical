import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [values, setValues] = useState(["read", "admin"]);
  return (
    <ExampleCell label="multiple">
      <ToggleGroup
        type="multiple"
        value={values}
        onValueChange={setValues}
        aria-label="Permission flags"
      >
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
    </ExampleCell>
  );
}
