import { EmptyState } from "@app/components/v4/ui/empty";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleCell align="stretch" label="bare">
      <EmptyState
        media="bare"
        icon="history"
        title="No versions yet"
        description="Each change to this secret saves a version here."
      />
    </ExampleCell>
  );
}
