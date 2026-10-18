import { useState } from "react";

import * as UI from "@app/components/v4/ui/hover-card";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const placements = [
  { side: "top", align: "start" },
  { side: "right", align: "center" },
  { side: "bottom", align: "end" },
  { side: "left", align: "center" }
] as const;
export default function Example() {
  const [selected, setSelected] = useState("");
  return (
    <ExampleGrid width="compact">
      {placements.map(({ side, align }) => (
        <ExampleCell
          key={side}
          label={
            <>
              {side} / {align}
            </>
          }
        >
          <UI.HoverCard>
            <UI.HoverCardTrigger asChild>
              <a
                href="#hover-card"
                aria-label={`Staging connection / ${side} / ${align}`}
                onClick={(event) => {
                  event.preventDefault();
                  setSelected(`${side} / ${align}`);
                }}
              >
                Staging connection
              </a>
            </UI.HoverCardTrigger>
            <UI.HoverCardContent
              side={side}
              align={align}
              style={{ minWidth: 0, maxWidth: "var(--radix-hover-card-content-available-width)" }}
            >
              <p>Staging connection</p>
              <p>12 versions synchronized. Read access belongs to the Platform team.</p>
            </UI.HoverCardContent>
          </UI.HoverCard>
        </ExampleCell>
      ))}
      {selected && (
        <p role="status" className="sr-only">
          Staging connection selected locally, {selected}.
        </p>
      )}
    </ExampleGrid>
  );
}
