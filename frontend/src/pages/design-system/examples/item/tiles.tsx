import { useState } from "react";

import { Media, Tile } from "@app/components/v4/ui/item";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  const [selected, setSelected] = useState(false);
  return (
    <ExampleStack>
      <Tile selected={selected} onClick={() => setSelected(!selected)}>
        <span className="flex items-center gap-3">
          <Media icon="machine" />
          Machine identity
        </span>
      </Tile>
      <p role="status" className="sr-only">
        {selected ? "Machine identity selected" : "No identity selected"}
      </p>
    </ExampleStack>
  );
}
