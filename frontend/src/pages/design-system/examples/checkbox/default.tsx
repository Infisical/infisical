import { useState } from "react";

import { Checkbox } from "@app/components/v4/ui/checkbox";

import { ExampleStack } from "../../example-presentation";

const environments = ["Staging", "Production"];
export default function Example() {
  const [selected, setSelected] = useState(["Staging"]);
  const all = selected.length === environments.length;
  const parentChecked = all || (selected.length > 0 ? "indeterminate" : false);
  return (
    <ExampleStack>
      <div className="flex items-center gap-3">
        <Checkbox
          id="checkbox-all"
          label="Select available environments"
          checked={parentChecked}
          onCheckedChange={(value) => setSelected(value === true ? environments : [])}
        />
      </div>
      <div className="space-y-3 pl-6">
        {environments.map((environment) => (
          <div key={environment} className="flex items-center gap-3">
            <Checkbox
              id={`checkbox-${environment}`}
              label={environment}
              checked={selected.includes(environment)}
              onCheckedChange={(value) =>
                setSelected((current) =>
                  value === true
                    ? [...current, environment]
                    : current.filter((item) => item !== environment)
                )
              }
            />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <Checkbox
            id="checkbox-policy"
            label="Audit environment"
            description="Required by policy."
            defaultChecked
            disabled
          />
        </div>
      </div>
      <p role="status" className="sr-only">
        {selected.length} of {environments.length} available environments selected. This draft does
        not grant access.
      </p>
    </ExampleStack>
  );
}
