import { CopyButton } from "@app/components/v4/ui/sensitive-editor";

import { ExampleCell, ExampleGrid } from "../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell align="stretch" label="Copy">
        <CopyButton value="example-resource-id" label="Copy identifier" />
      </ExampleCell>
      <ExampleCell align="stretch" label="Disabled">
        <CopyButton value="example-resource-id" label="Copy protected identifier" disabled />
      </ExampleCell>
    </ExampleGrid>
  );
}
