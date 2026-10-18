import { Button } from "@app/components/v4/ui/button";
import { DataList, List, ListRow } from "@app/components/v4/ui/list";

import { ExampleCell, ExampleGrid } from "../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      {(["framed", "plain", "bare"] as const).map((variant) => (
        <ExampleCell align="stretch" key={variant} label={variant}>
          <List label={`${variant} records`} variant={variant}>
            <ListRow
              value="staging"
              label="Staging"
              title="Staging service"
              description="Read access to project versions"
            />
          </List>
        </ExampleCell>
      ))}
      {(["md", "sm"] as const).map((size) => (
        <ExampleCell align="stretch" key={size} label={size}>
          <List label={`${size} records`} size={size}>
            <ListRow
              value="staging"
              label="Staging"
              title="Staging service"
              description="Read access to project versions"
              meta="12 versions"
            />
          </List>
        </ExampleCell>
      ))}
      <ExampleCell align="stretch" label="Actions below, no selection">
        <List label="Connection recovery" actionsPlacement="below">
          <ListRow
            value="expired"
            label="Expired connection"
            title="Expired connection"
            error="Update provider access before synchronizing."
            disabled
          />
          <ListRow
            value="public"
            label="Input guide"
            title="Input guide"
            href="#input"
            actions={
              <Button asChild variant="outline">
                <a href="#code">Code guide</a>
              </Button>
            }
          >
            Provider settings are public configuration.
          </ListRow>
        </List>
      </ExampleCell>
      {(["stat", "meta", "props"] as const).map((variant) => (
        <ExampleCell align="stretch" key={variant} label={variant}>
          <DataList
            variant={variant}
            items={
              variant === "stat"
                ? [
                    ["Connections", 12],
                    ["Policies", 0]
                  ]
                : [
                    ["Connections", 12],
                    ["Region", "Unavailable"]
                  ]
            }
          />
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
