import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { Select } from "@app/components/v4/ui/select";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const environments = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "preview", label: "Preview for pull request 4821, payments-api checkout redesign" }
];

function EnvironmentMenu({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const label = environments.find((environment) => environment.value === value)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          layout="trigger"
          className="w-56"
          aria-label={`Environment: ${label}`}
        >
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={setValue}>
          {environments.map((environment) => (
            <DropdownMenuRadioItem key={environment.value} value={environment.value}>
              {environment.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Example() {
  return (
    <ExampleGrid width="field">
      <ExampleCell label="Button layout trigger">
        <EnvironmentMenu initial="production" />
      </ExampleCell>
      <ExampleCell label="SelectTrigger">
        <div className="w-56">
          <Select aria-label="Environment" options={environments} defaultValue="production" />
        </div>
      </ExampleCell>
      <ExampleCell label="Long value truncates">
        <EnvironmentMenu initial="preview" />
      </ExampleCell>
    </ExampleGrid>
  );
}
