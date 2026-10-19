import { Button } from "@app/components/v4/ui/button";
import { EmptyState } from "@app/components/v4/ui/empty";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleCell label="First use with action">
      <EmptyState
        title="No connections yet"
        description="Connections synchronize this environment."
        icon="sync"
        actions={
          <Button asChild>
            <a href="#combobox">Add connection</a>
          </Button>
        }
      />
    </ExampleCell>
  );
}
