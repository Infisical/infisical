import { Identity } from "@app/components/v4/ui/avatar";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <Identity name="Alex Kim" description="Workspace administrator" />
      <Identity name="deploy-production" kind="machine" mono />
      <Identity name="rotation-agent" kind="agent" mono description="Read access to staging" />
    </ExampleStack>
  );
}
