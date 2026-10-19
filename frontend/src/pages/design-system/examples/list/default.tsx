import { Button } from "@app/components/v4/ui/button";
import { DataList, List, ListRow } from "@app/components/v4/ui/list";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="wide">
      <ExampleCell align="stretch" label="framed">
        <List label="Connections" title="Connections">
          <ListRow
            value="staging"
            label="Staging service"
            title="Staging service"
            description="Read access to project versions"
            meta="12 versions"
          />
          <ListRow
            value="production"
            label="Production service"
            title="Production service"
            description="Write access, approval required"
            actions={<Button variant="outline">Review</Button>}
          />
          <ListRow
            value="preview"
            label="Preview service"
            title="Preview service"
            meta="2 versions"
          />
        </List>
      </ExampleCell>
      <ExampleCell align="stretch" label="Empty">
        <List label="Empty connections" empty="No connections yet" />
      </ExampleCell>
      <ExampleCell align="stretch" label="stat">
        <DataList
          variant="stat"
          items={[
            ["Connections", 12],
            ["Policies", 0]
          ]}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
