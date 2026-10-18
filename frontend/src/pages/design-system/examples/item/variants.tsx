import { Button } from "@app/components/v4/ui/button";
import { Item, Media, Tile } from "@app/components/v4/ui/item";

import { ExampleCell, ExampleGrid, ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      {(["default", "outline", "muted"] as const).map((variant) => (
        <ExampleCell align="stretch" key={variant} label={variant}>
          <Item variant={variant} title="Deployment service" description="Read access to staging" />
        </ExampleCell>
      ))}
      {(
        [
          ["default", "default, md"],
          ["sm", "sm"],
          ["xs", "xs"]
        ] as const
      ).map(([size, label]) => (
        <ExampleCell align="stretch" key={size} label={label}>
          <Item size={size} title="Deployment service" description="Read access to staging" />
        </ExampleCell>
      ))}
      <ExampleCell align="stretch" label="Resolved, full text">
        <Item
          title="applications/staging/services/payment-processing/configuration"
          description="Versions synchronized successfully"
          resolved
          truncate={false}
          mono
          actionsPlacement="below"
          actions={
            <Button asChild variant="outline">
              <a href="#code">View configuration guide</a>
            </Button>
          }
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Disabled selection">
        <Tile
          title="Managed vault"
          description="Connection managed by the organization"
          disabled
          selected={false}
        />
      </ExampleCell>
      <ExampleGrid width="compact">
        {(["ok", "warn", "bad", "info"] as const).map((tone) => (
          <ExampleCell align="stretch" key={tone} label={tone}>
            <Media tone={tone} icon="lock" size="sm" />
          </ExampleCell>
        ))}
      </ExampleGrid>
    </ExampleStack>
  );
}
