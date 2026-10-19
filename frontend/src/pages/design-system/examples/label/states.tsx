import { Input } from "@app/components/v4/ui/input";
import { Label } from "@app/components/v4/ui/label";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="label-required">Name (required)</Label>
        <Input id="label-required" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="label-optional">Description (optional)</Label>
        <Input id="label-optional" />
      </div>
      <div className="group flex flex-col gap-1.5" data-disabled="true">
        <Label htmlFor="label-disabled">Managed name</Label>
        <Input id="label-disabled" disabled defaultValue="platform" />
      </div>
    </ExampleStack>
  );
}
