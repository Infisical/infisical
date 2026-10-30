import { List, ListRow, ListSection } from "@app/components/v4/ui/list";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const rows = (prefix: string) => (
  <>
    <ListRow
      value={`${prefix}-api`}
      label="API service"
      title="API service"
      description="Reads production secrets"
      meta="12 secrets"
    />
    <ListRow
      value={`${prefix}-worker`}
      label="Queue worker"
      title="Queue worker"
      description="Reads staging secrets"
      meta="4 secrets"
    />
  </>
);
export default function Variants() {
  return (
    <ExampleGrid width="wide">
      <ExampleCell align="stretch" label="md">
        <List
          label="Machine identities"
          title="Machine identities"
          action={<a href="#list">View all</a>}
        >
          {rows("framed")}
        </List>
      </ExampleCell>
      <ExampleCell align="stretch" label="framed, sections">
        <List label="Grouped identities">
          <ListSection label="Production" meta="2">
            {rows("production")}
          </ListSection>
          <ListSection label="Staging" meta="1">
            <ListRow
              value="staging-preview"
              label="Preview deploys"
              title="Preview deploys"
              description="Reads staging secrets"
              meta="3 secrets"
            />
          </ListSection>
        </List>
      </ExampleCell>
      <ExampleCell align="stretch" label="plain">
        <List label="Plain identities" variant="plain">
          {rows("plain")}
        </List>
      </ExampleCell>
      <ExampleCell align="stretch" label="sm">
        <List label="Small identities" size="sm" title="Identities">
          {rows("sm")}
        </List>
      </ExampleCell>
    </ExampleGrid>
  );
}
