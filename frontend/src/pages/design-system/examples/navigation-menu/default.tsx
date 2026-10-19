import { useState } from "react";

import * as UI from "@app/components/v4/ui/navigation-menu";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  const [destination, setDestination] = useState("Overview");
  return (
    <ExampleStack>
      <UI.NavigationMenu>
        <UI.NavigationMenuList>
          <UI.NavigationMenuItem>
            <UI.NavigationMenuLink
              href="#example-overview"
              active={destination === "Overview"}
              onClick={(event) => {
                event.preventDefault();
                setDestination("Overview");
              }}
            >
              Overview
            </UI.NavigationMenuLink>
          </UI.NavigationMenuItem>
          <UI.NavigationMenuItem>
            <UI.NavigationMenuTrigger>Resources</UI.NavigationMenuTrigger>
            <UI.NavigationMenuContent>
              {["Secrets", "Connections"].map((label) => (
                <UI.NavigationMenuLink
                  key={label}
                  href={`#example-${label.toLowerCase()}`}
                  active={destination === label}
                  onClick={(event) => {
                    event.preventDefault();
                    setDestination(label);
                  }}
                >
                  {label}
                </UI.NavigationMenuLink>
              ))}
            </UI.NavigationMenuContent>
          </UI.NavigationMenuItem>
          <UI.NavigationMenuItem value="activity">
            <UI.NavigationMenuTrigger>Activity</UI.NavigationMenuTrigger>
            <UI.NavigationMenuContent>
              {["Credential rotation history", "Client access decisions"].map((label) => (
                <UI.NavigationMenuLink
                  key={label}
                  href="#navigation-menu"
                  active={destination === label}
                  onClick={(event) => {
                    event.preventDefault();
                    setDestination(label);
                  }}
                >
                  {label}
                </UI.NavigationMenuLink>
              ))}
            </UI.NavigationMenuContent>
          </UI.NavigationMenuItem>
        </UI.NavigationMenuList>
      </UI.NavigationMenu>
      <p role="status" className="sr-only">
        Current local view: {destination}.
      </p>
    </ExampleStack>
  );
}
