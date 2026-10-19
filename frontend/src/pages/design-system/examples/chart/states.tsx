import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Spinner } from "@app/components/v4/ui/spinner";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell align="stretch" label="Loading">
        <div className="flex min-h-24 w-full items-center justify-center">
          <Spinner size="base" label="Loading request counts" />
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
