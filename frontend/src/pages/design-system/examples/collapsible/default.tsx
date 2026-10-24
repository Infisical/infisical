import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/collapsible";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <UI.Collapsible>
        <UI.CollapsibleTrigger asChild>
          <Button variant="outline">View connection details</Button>
        </UI.CollapsibleTrigger>
        <UI.CollapsibleContent>
          <p className="mt-4">Last synchronized 12 versions.</p>
        </UI.CollapsibleContent>
      </UI.Collapsible>
    </ExampleStack>
  );
}
