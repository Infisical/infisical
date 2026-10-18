import { useState } from "react";

import { Field } from "@app/components/v4/ui/field";
import { MultiSelect, type MultiSelectOption } from "@app/components/v4/ui/multi-select";

import { ExampleGrid } from "../../example-presentation";

const options: MultiSelectOption[] = [
  { value: "read", label: "Read", description: "Fetch existing values", group: "Secrets" },
  { value: "write", label: "Write", group: "Secrets" },
  { value: "admin", label: "Admin", group: "Project", disabled: true }
];
export default function Example() {
  const [roles, setRoles] = useState(["read", "admin"]);
  const [single, setSingle] = useState<string | null>("read");
  return (
    <ExampleGrid>
      <Field label="Project roles" description="Admin is required by policy.">
        <MultiSelect
          label="Project roles"
          allLabel="All project permissions"
          options={options}
          value={roles}
          onChange={setRoles}
        />
      </Field>
      <Field label="One permission">
        <MultiSelect
          label="One permission"
          multiple={false}
          value={single}
          onChange={setSingle}
          options={options}
        />
      </Field>
      <p role="status" className="sr-only">
        Selected roles:{" "}
        {roles
          .map((role) => options.find((option) => option.value === role)?.label ?? role)
          .join(", ") || "none"}
        . Single permission: {single ?? "none"}.
      </p>
    </ExampleGrid>
  );
}
