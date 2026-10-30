import { Count } from "@app/components/v4/ui/badge";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {(["accent", "ink", "neutral"] as const).map((tone) => (
        <ExampleCell key={tone} label={tone}>
          <span className="flex items-center gap-2">
            Waiting requests
            <Count tone={tone} aria-label="4 waiting requests">
              4
            </Count>
          </span>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
