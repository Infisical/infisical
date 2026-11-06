import { useState } from "react";

import { connectionCreation } from "@app/components/v4/patterns/app-connection-form";
import { Combobox, type ComboboxOption } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { CONNECTION_PRESETS } from "@app/pages/v4/data/integrations/connection-presets";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const seeded: ComboboxOption[] = [
  { value: "aws-production", label: "aws-production", meta: "Assume Role" },
  {
    value: "aws-payments-legacy-access-key",
    label: "aws-payments-legacy-access-key",
    meta: "Access Key"
  }
];

export default function Example() {
  const [options, setOptions] = useState(seeded);
  const [value, setValue] = useState("aws-production");
  const creation = connectionCreation({
    preset: CONNECTION_PRESETS[AppConnection.AWS],
    create: async (values) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 900);
      });
      const connection = { id: `demo-${values.name}`, name: values.name };
      setOptions((current) => [...current, { value: connection.id, label: connection.name }]);
      return connection;
    }
  });
  const selected = options.find((option) => option.value === value)?.label ?? "none";
  return (
    <ExampleGrid width="wide">
      <ExampleCell label={`Selected: ${selected}. Demo data, nothing is sent.`}>
        <Field label="AWS connection">
          <Combobox
            label="AWS connection"
            options={options}
            value={value}
            onChange={setValue}
            placeholder="Select connection"
            creation={creation}
          />
        </Field>
      </ExampleCell>
      <ExampleCell label="Without permission to create connections">
        <Field label="AWS connection">
          <Combobox
            label="AWS connection"
            options={seeded}
            defaultValue="aws-production"
            creation={connectionCreation({
              preset: CONNECTION_PRESETS[AppConnection.AWS],
              disabledReason: "No permission to create.",
              create: async () => {
                throw new Error("Creation is not allowed.");
              }
            })}
          />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
