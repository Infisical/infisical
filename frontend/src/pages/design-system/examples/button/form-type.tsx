import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [name, setName] = useState("payments-api");
  const [saved, setSaved] = useState(0);
  return (
    <ExampleCell label="Generate keeps the default type; Save sets type submit">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved((count) => count + 1);
        }}
      >
        <Field label="Identity name">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setName(`identity-${Date.now() % 10000}`)}
          >
            Generate name
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Save
          </Button>
          <span role="status" className="text-sm">
            {saved ? `Saved ${saved} ${saved === 1 ? "time" : "times"}` : "Not saved yet"}
          </span>
        </div>
      </form>
    </ExampleCell>
  );
}
