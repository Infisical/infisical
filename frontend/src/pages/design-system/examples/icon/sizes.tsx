import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {([12, 16, 20, 24] as const).map((size) => (
        <ExampleCell key={size} label={<>{size}px</>}>
          <Icon name="key" size={size} />
        </ExampleCell>
      ))}
      <ExampleCell label="Named image">
        <Icon name="lock" label="Encrypted" />
      </ExampleCell>
      <ExampleCell label="Action icon">
        <Button asChild variant="outline" icon="key">
          <a href="#sensitive-editor">View editor</a>
        </Button>
      </ExampleCell>
    </ExampleGrid>
  );
}
