import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";

export default function Example() {
  const [count, setCount] = useState(0);
  return (
    <TooltipProvider>
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <Tooltip content="Check synchronization">
            <Button variant="outline" onClick={() => setCount(count + 1)}>
              Refresh
            </Button>
          </Tooltip>
          <Tooltip
            side="bottom"
            align="start"
            wrap
            content="Read access permits fetching values. It does not permit creating or updating secrets."
          >
            <Button variant="ghost">About read access</Button>
          </Tooltip>
        </div>
        <p role="status" className="sr-only">
          Refresh requested {count} times in this preview.
        </p>
      </div>
    </TooltipProvider>
  );
}
