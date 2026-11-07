import { Input } from "@app/components/v4/ui/input";
import * as UI from "@app/components/v4/ui/label";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <div className="flex flex-col gap-1.5">
        <UI.Label htmlFor="label-example">Environment name</UI.Label>
        <Input id="label-example" defaultValue="staging" />
      </div>
    </ExampleStack>
  );
}
