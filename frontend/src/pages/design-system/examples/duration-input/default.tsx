import { useState } from "react";

import { DurationInput } from "@app/components/v4/ui/duration-input";
import { Field } from "@app/components/v4/ui/field";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [duration, setDuration] = useState("1h");
  const [empty, setEmpty] = useState("");
  const [invalid, setInvalid] = useState("0m");
  return (
    <ExampleGrid>
      <ExampleCell label={duration ? `Controlled, value ${duration}` : "Controlled, value empty"}>
        <Field label="Duration">
          <DurationInput value={duration} onChange={setDuration} />
        </Field>
      </ExampleCell>
      <ExampleCell label="Empty">
        <Field label="Request expiration" optional>
          <DurationInput value={empty} onChange={setEmpty} placeholder="72" />
        </Field>
      </ExampleCell>
      <ExampleCell label="Invalid">
        <Field label="Duration" error="Enter a duration greater than 0.">
          <DurationInput value={invalid} onChange={setInvalid} invalid />
        </Field>
      </ExampleCell>
      <ExampleCell label="Disabled">
        <Field label="Max time period">
          <DurationInput value="7d" onChange={() => undefined} disabled />
        </Field>
      </ExampleCell>
    </ExampleGrid>
  );
}
