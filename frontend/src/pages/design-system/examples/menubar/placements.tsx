import { useState } from "react";

import * as UI from "@app/components/v4/ui/menubar";

import { ExampleGrid } from "../../example-presentation";

const placements = [
  { side: "top", align: "start" },
  { side: "right", align: "center" },
  { side: "bottom", align: "end" },
  { side: "left", align: "center" }
] as const;
export default function Example() {
  const [selected, setSelected] = useState(false);
  return (
    <ExampleGrid width="compact">
      {placements.map(({ side, align }) => (
        <UI.Menubar key={side}>
          <UI.MenubarMenu>
            <UI.MenubarTrigger>
              {side} / {align}
            </UI.MenubarTrigger>
            <UI.MenubarContent
              side={side}
              align={align}
              style={{ minWidth: 0, maxWidth: "var(--radix-menubar-content-available-width)" }}
            >
              <UI.MenubarItem onSelect={() => setSelected(true)}>Connection details</UI.MenubarItem>
              <UI.MenubarItem disabled>Delete locked environment</UI.MenubarItem>
            </UI.MenubarContent>
          </UI.MenubarMenu>
        </UI.Menubar>
      ))}
      {selected && (
        <p role="status" className="sr-only">
          Staging connection: vault.example.test
        </p>
      )}
    </ExampleGrid>
  );
}
