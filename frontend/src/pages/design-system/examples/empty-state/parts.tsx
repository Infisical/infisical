import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleCell align="stretch" label="tile">
      <UI.Empty>
        <UI.EmptyMedia variant="tile">
          <Icon name="key" />
        </UI.EmptyMedia>
        <UI.EmptyHeader>
          <UI.EmptyTitle>No secrets in staging yet</UI.EmptyTitle>
          <UI.EmptyDescription>
            Add one, or copy them from development in one step. Syncs pick them up on the next push.
          </UI.EmptyDescription>
        </UI.EmptyHeader>
        <UI.EmptyContent>
          <Button icon="plus">Add secret</Button>
        </UI.EmptyContent>
      </UI.Empty>
    </ExampleCell>
  );
}
