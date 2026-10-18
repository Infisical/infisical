import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="wide">
      {(["default", "icon"] as const).map((variant) => (
        <ExampleCell key={variant} label={variant}>
          <UI.Empty className="flex-none">
            <UI.EmptyHeader>
              <UI.EmptyMedia variant={variant}>
                <Icon name="inbox" />
              </UI.EmptyMedia>
              <UI.EmptyTitle>No connections yet</UI.EmptyTitle>
              <UI.EmptyDescription>
                Add a connection to synchronize this environment.
              </UI.EmptyDescription>
            </UI.EmptyHeader>
            <UI.EmptyContent>
              <Button asChild>
                <a href="#select">Choose a provider</a>
              </Button>
            </UI.EmptyContent>
          </UI.Empty>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
