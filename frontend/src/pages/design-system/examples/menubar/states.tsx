import { useState } from "react";

import * as UI from "@app/components/v4/ui/menubar";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const stateLabel = (checked: boolean | "indeterminate") => {
  if (checked === "indeterminate") return "Mixed";
  return checked ? "Checked" : "Unchecked";
};
export default function Example() {
  const [selected, setSelected] = useState(false);
  return (
    <ExampleGrid width="compact">
      {([false, true, "indeterminate"] as const).map((checked) => (
        <ExampleCell key={String(checked)} label={stateLabel(checked)}>
          <UI.Menubar>
            <UI.MenubarMenu>
              <UI.MenubarTrigger>Open menu</UI.MenubarTrigger>
              <UI.MenubarContent>
                <UI.MenubarCheckboxItem checked={checked} disabled>
                  Include deployment-client metadata and inherited environment permissions
                </UI.MenubarCheckboxItem>
                <UI.MenubarItem onSelect={() => setSelected(true)}>
                  Connection details
                </UI.MenubarItem>
              </UI.MenubarContent>
            </UI.MenubarMenu>
          </UI.Menubar>
        </ExampleCell>
      ))}
      {selected && (
        <p role="status" className="sr-only">
          Staging connection: vault.example.test
        </p>
      )}
    </ExampleGrid>
  );
}
