import { useState } from "react";

import * as UI from "@app/components/v4/ui/navigation-menu";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [value, setValue] = useState("");
  const [destination, setDestination] = useState("Overview");
  return (
    <ExampleGrid width="full">
      {(["horizontal", "vertical"] as const).map((orientation) => (
        <ExampleCell key={orientation} label={<>{orientation} / inline panel</>}>
          <UI.NavigationMenu
            viewport={false}
            className="max-w-full"
            orientation={orientation}
            value={value}
            onValueChange={setValue}
            aria-label={`${orientation} connection navigation`}
          >
            <UI.NavigationMenuList
              className={orientation === "vertical" ? "flex-col items-start" : "flex-wrap"}
            >
              <UI.NavigationMenuItem value={`${orientation}-resources`}>
                <UI.NavigationMenuTrigger>Resources</UI.NavigationMenuTrigger>
                <UI.NavigationMenuContent>
                  {["Secrets", "Connections"].map((label) => (
                    <UI.NavigationMenuLink
                      key={label}
                      href="#navigation-menu"
                      active={destination === label}
                      onClick={(event) => {
                        event.preventDefault();
                        setDestination(label);
                        setValue("");
                      }}
                    >
                      {label}
                    </UI.NavigationMenuLink>
                  ))}
                </UI.NavigationMenuContent>
              </UI.NavigationMenuItem>
              <UI.NavigationMenuItem>
                <UI.NavigationMenuTrigger disabled>Archived</UI.NavigationMenuTrigger>
              </UI.NavigationMenuItem>
            </UI.NavigationMenuList>
          </UI.NavigationMenu>
        </ExampleCell>
      ))}
      <p role="status" className="sr-only">
        Local view: {destination}
      </p>
    </ExampleGrid>
  );
}
