import { ScrollArea, ScrollBar } from "@app/components/v4/ui/scroll-area";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      {(["auto", "always", "scroll", "hover"] as const).map((type) => (
        <ExampleCell align="stretch" key={type} label={type}>
          <div className="h-28 w-full">
            <ScrollArea
              type={type}
              aria-label={`${type} version history`}
              className="h-full w-full"
            >
              <ul className="space-y-2 p-3">
                {Array.from({ length: 10 }, (_, index) => (
                  <li key={index}>Version {10 - index}</li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </ExampleCell>
      ))}
      <ExampleCell align="stretch" label="Both axes">
        <div className="h-36 w-full">
          <ScrollArea type="always" className="h-full w-full" aria-label="Wide version records">
            <div className="w-max space-y-2 p-3">
              {Array.from({ length: 8 }, (_, index) => (
                <p key={index}>
                  Version {8 - index},
                  applications/staging/services/payment-processing/configuration
                </p>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </ExampleCell>
    </ExampleGrid>
  );
}
