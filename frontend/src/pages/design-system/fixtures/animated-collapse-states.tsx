import { useId, useState } from "react";

import { AnimatedCollapse } from "@app/components/v4/ui/animated-collapse";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleStack } from "../example-presentation";

export default function Example() {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <ExampleStack>
      <Button
        variant="outline"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        Eager connection details
      </Button>
      <AnimatedCollapse className="w-full" id={id} open={open} lazy={false}>
        <div className="pt-3">
          <Field label="Retention note">
            <Input defaultValue="Keep for 30 days" />
          </Field>
        </div>
      </AnimatedCollapse>
    </ExampleStack>
  );
}
