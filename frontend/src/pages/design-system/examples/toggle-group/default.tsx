import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleCell label="single">
      <ToggleGroup type="single" defaultValue="all" aria-label="Connection status">
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="active">Active</ToggleGroupItem>
        <ToggleGroupItem value="failing">Failing</ToggleGroupItem>
      </ToggleGroup>
    </ExampleCell>
  );
}
