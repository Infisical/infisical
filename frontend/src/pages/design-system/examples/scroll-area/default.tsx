import * as UI from "@app/components/v4/ui/scroll-area";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <UI.ScrollArea className="h-48 w-full">
        <ul className="space-y-3 p-4">
          {Array.from({ length: 20 }, (_, index) => (
            <li key={index}>Version {20 - index}</li>
          ))}
        </ul>
      </UI.ScrollArea>
    </ExampleStack>
  );
}
