import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DetailLayout } from "@app/components/v4/ui/layout";
import { DataList, List, ListRow } from "@app/components/v4/ui/list";

import { ExampleCell, ExampleStack } from "../../example-presentation";

const Specimen = () => (
  <DetailLayout
    asideLabel="Details"
    aside={
      <Card title="Details">
        <DataList
          variant="props"
          items={[
            ["ID", <code key="id">4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11</code>],
            ["Managed by", "Organization"],
            ["Organization role", "Member"],
            [
              "Metadata",
              <Badge key="meta" tone="outline" mono>
                runner=github-actions-self-hosted
              </Badge>
            ],
            ["Last login", "Never"]
          ]}
        />
      </Card>
    }
  >
    <List
      label="Auth methods"
      title="Authentication"
      action={
        <Button variant="outline" size="sm" icon="plus">
          Add auth method
        </Button>
      }
    >
      <ListRow
        value="universal"
        label="Universal Auth"
        title="Universal Auth"
        description="Last used 4 minutes ago"
      />
      <ListRow
        value="oidc"
        label="OIDC Auth"
        title="OIDC Auth"
        description="Not used in the last 30 days"
      />
    </List>
    <List label="Projects" title="Projects">
      <ListRow
        value="payments"
        label="payments-api"
        title={<code>payments-api</code>}
        meta="Developer"
      />
      <ListRow
        value="platform"
        label="platform-core-shared-infrastructure-eu-west-1"
        title={<code>platform-core-shared-infrastructure-eu-west-1</code>}
        meta="Viewer"
      />
    </List>
  </DetailLayout>
);

export default function Example() {
  return (
    <ExampleStack>
      <ExampleCell align="stretch" label="Wide container, sidecar on the right">
        <Specimen />
      </ExampleCell>
      <ExampleCell align="stretch" label="Narrow container, sidecar stacks above the main cards">
        <div style={{ maxWidth: "var(--v4-size-measure-form)" }}>
          <Specimen />
        </div>
      </ExampleCell>
    </ExampleStack>
  );
}
