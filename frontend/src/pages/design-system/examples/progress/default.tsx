import { Progress, ProgressSteps } from "@app/components/v4/ui/progress";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <Progress label="Imported secrets" value={32} max={80} valueLabel="32 / 80" />
      <ProgressSteps label="Import stages" steps={["Connect", "Validate", "Import"]} current={1} />
    </ExampleStack>
  );
}
