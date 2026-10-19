import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      {(["default", "destructive"] as const).map((variant) => (
        <ExampleCell key={variant} label={variant}>
          <Alert variant={variant}>
            <AlertTitle>Connection needs review</AlertTitle>
            <AlertDescription>
              The provider configuration differs from the saved version.
            </AlertDescription>
          </Alert>
        </ExampleCell>
      ))}
      <ExampleCell label="Action">
        <Alert
          title="Connection needs review"
          tone="warn"
          actions={
            <Button asChild variant="outline">
              <a href="#input">Review configuration</a>
            </Button>
          }
        >
          The provider configuration differs from the saved version.
        </Alert>
      </ExampleCell>
    </ExampleGrid>
  );
}
