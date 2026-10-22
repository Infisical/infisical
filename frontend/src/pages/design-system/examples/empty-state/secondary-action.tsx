import { Button } from "@app/components/v4/ui/button";
import { EmptyState } from "@app/components/v4/ui/empty";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleCell align="stretch" label="Primary and secondary action">
      <EmptyState
        icon="key"
        title="No secrets in staging yet"
        description="Add one, or copy them from development in one step. Syncs pick them up on the next push."
        actions={
          <>
            <Button icon="plus">Add secret</Button>
            <Button variant="outline" icon="upload">
              Import from .env
            </Button>
          </>
        }
      />
    </ExampleCell>
  );
}
