import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Skeleton } from "@app/components/v4/ui/skeleton";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell align="stretch" label="Loading">
        <div aria-busy="true" className="w-full">
          <span role="status" className="sr-only">
            Loading request counts
          </span>
          <div className="flex h-40 items-end justify-around border-b border-[color:var(--v4-line)] pl-9">
            {["60%", "85%", "45%"].map((height) => (
              <Skeleton key={height} width={40} height={height} />
            ))}
          </div>
          <div className="flex justify-around pt-2 pl-9">
            {["Mon", "Tue", "Wed"].map((day) => (
              <Skeleton key={day} width={28} height={10} />
            ))}
          </div>
        </div>
      </ExampleCell>
      <ExampleCell align="stretch" label="Empty">
        <EmptyState
          title="No requests yet"
          description="Request counts will appear when clients connect."
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Error">
        <Alert variant="destructive">
          <AlertTitle>Request counts unavailable</AlertTitle>
          <AlertDescription>Try again when the connection is restored.</AlertDescription>
        </Alert>
      </ExampleCell>
    </ExampleGrid>
  );
}
