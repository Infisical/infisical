import { useEffect, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { RouteProgress } from "@app/components/v4/ui/route-progress";
import { Meta } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return undefined;
    const timer = window.setTimeout(() => setPending(false), 2400);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return (
    <ExampleGrid width="wide">
      <ExampleCell label="Route progress while a navigation resolves" align="stretch">
        <div className="relative flex h-24 flex-col items-start justify-end gap-2 contain-layout">
          <RouteProgress pending={pending} />
          <Button variant="outline" disabled={pending} onClick={() => setPending(true)}>
            Open audit logs
          </Button>
          <Meta mono={false} role="status">
            {pending ? "Opening audit logs" : "Audit logs open"}
          </Meta>
        </div>
      </ExampleCell>
    </ExampleGrid>
  );
}
