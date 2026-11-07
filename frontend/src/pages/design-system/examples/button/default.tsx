import { useEffect, useRef, useState } from "react";

import { Button } from "@app/components/v4/ui/button";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="default">
        <Button
          loading={pending}
          onClick={() => {
            setPending(true);
            timer.current = setTimeout(() => setPending(false), 900);
          }}
        >
          Save changes
        </Button>
      </ExampleCell>
      <ExampleCell label="accent">
        <Button variant="accent">Grant for 1 hour</Button>
      </ExampleCell>
      <ExampleCell label="outline">
        <Button variant="outline">Edit settings</Button>
      </ExampleCell>
      <ExampleCell label="ghost">
        <Button variant="ghost">Cancel</Button>
      </ExampleCell>
      <ExampleCell label="destructive">
        <Button variant="destructive">Delete project</Button>
      </ExampleCell>
      <ExampleCell label="link">
        <Button variant="link" asChild>
          <a href="#input">Input guide</a>
        </Button>
      </ExampleCell>
    </ExampleGrid>
  );
}
