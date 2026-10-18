import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@app/components/v4/ui/resizable";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      {(["horizontal", "vertical"] as const).map((orientation) => (
        <ExampleCell align="stretch" key={orientation} label={orientation}>
          <div className="h-48 w-full">
            <ResizablePanelGroup orientation={orientation}>
              <ResizablePanel defaultSize="50%" minSize="25%" maxSize="75%">
                <div className="min-w-0 p-3 text-sm break-words">Records</div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel minSize="25%">
                <div className="min-w-0 p-3 text-sm break-words">Record details</div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
