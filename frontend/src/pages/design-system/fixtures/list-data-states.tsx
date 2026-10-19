import { List, ListRow } from "@app/components/v4/ui/list";

import { ExampleCell, ExampleGrid } from "../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Empty result">
        <List label="Empty local connections" empty="No matching local connections" />
      </ExampleCell>
      <ExampleCell align="stretch" label="Pending, retained row">
        <List label="Loading local connections" loading loadingRows={2}>
          <ListRow
            value="staging"
            title="Staging service"
            label="Staging service"
            meta="12 versions"
          />
        </List>
      </ExampleCell>
      <ExampleCell align="stretch" label="Protected and disabled">
        <List label="Policy states" title="Local members" selection="multiple">
          <ListRow value="owner" title="Project owner" label="Project owner" selectable={false} />
          <ListRow value="disabled" title="Disabled service" label="Disabled service" disabled />
          <ListRow value="member" title="Project member" label="Project member" />
        </List>
      </ExampleCell>
    </ExampleGrid>
  );
}
