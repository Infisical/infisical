import { Icon } from "@app/components/v4/ui/icon";
import { Toggle } from "@app/components/v4/ui/toggle";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {(["outline", "ghost"] as const).map((variant) => (
        <ExampleCell key={variant} label={variant}>
          <div className="flex gap-2">
            <Toggle variant={variant} aria-label="Show history">
              <Icon name="history" />
            </Toggle>
            <Toggle variant={variant} aria-label="Show values" defaultPressed>
              <Icon name="eye" />
            </Toggle>
          </div>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
