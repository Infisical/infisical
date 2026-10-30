import { Label } from "@app/components/v4/ui/label";
import * as UI from "@app/components/v4/ui/textarea";

import { ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      <div className="space-y-2">
        <Label htmlFor="description">Connection description</Label>
        <UI.Textarea id="description" defaultValue="Synchronizes the staging environment." />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invalid-description">Change reason</Label>
        <UI.Textarea id="invalid-description" aria-invalid aria-describedby="reason-error" />
        <p id="reason-error">Explain why access is needed.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="managed-description">Managed description</Label>
        <UI.Textarea id="managed-description" value="Required by policy" disabled />
      </div>
    </ExampleGrid>
  );
}
