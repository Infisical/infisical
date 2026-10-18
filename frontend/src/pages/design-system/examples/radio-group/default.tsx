import { useState } from "react";

import { Label } from "@app/components/v4/ui/label";
import { RadioGroup, RadioGroupItem } from "@app/components/v4/ui/radio-group";

export default function Example() {
  const [value, setValue] = useState("staging");
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-sm font-medium">Environment access</legend>
      <RadioGroup value={value} onValueChange={setValue} aria-label="Environment access">
        {["staging", "production", "archived"].map((environment) => (
          <div key={environment} className="flex items-center gap-3">
            <RadioGroupItem
              id={`radio-${environment}`}
              value={environment}
              disabled={environment === "archived"}
            />
            <Label htmlFor={`radio-${environment}`}>{environment}</Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
