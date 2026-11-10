import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell label="single">
        <ToggleGroup type="single" defaultValue="all" aria-label="Connection status">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="active">Active</ToggleGroupItem>
          <ToggleGroupItem value="failing">Failing</ToggleGroupItem>
        </ToggleGroup>
      </ExampleCell>
      <ExampleCell label="single, full width" align="stretch">
        <ToggleGroup
          type="single"
          width="full"
          defaultValue="all"
          aria-label="Connection status, full width"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="active">Active</ToggleGroupItem>
          <ToggleGroupItem value="failing">Failing</ToggleGroupItem>
        </ToggleGroup>
      </ExampleCell>
    </ExampleGrid>
  );
}
