import { useState } from "react";

import * as UI from "@app/components/v4/ui/hover-card";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  const [inspected, setInspected] = useState(false);
  return (
    <ExampleStack>
      <UI.HoverCard>
        <UI.HoverCardTrigger asChild>
          <a
            href="#hover-card"
            onClick={(event) => {
              event.preventDefault();
              setInspected(true);
            }}
          >
            Staging connection
          </a>
        </UI.HoverCardTrigger>
        <UI.HoverCardContent>
          <p>Last synchronized 12 versions.</p>
          <p>All clients are up to date.</p>
        </UI.HoverCardContent>
      </UI.HoverCard>
      {inspected && (
        <p role="status" className="sr-only mt-4">
          Staging connection selected in this local example.
        </p>
      )}
    </ExampleStack>
  );
}
