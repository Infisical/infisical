import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Media } from "@app/components/v4/ui/item";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell label="lg" align="stretch">
        <PageHeader
          title="Organization overview"
          description="2 approvals and 1 failed sync need you."
          actions={
            <>
              <Button variant="outline">Invite members</Button>
              <Button variant="primary">New project</Button>
            </>
          }
        />
      </ExampleCell>
      <ExampleCell label="md" align="stretch">
        <PageHeader
          size="md"
          mono
          title="stripe_api_key"
          media={<Media icon="key" size="md" />}
          breadcrumb={[
            { label: "payments-api", href: "#page-header", mono: true },
            { label: "backend", href: "#page-header", mono: true },
            { label: "billing", href: "#page-header", mono: true },
            { label: "providers", href: "#page-header", mono: true },
            { label: "stripe", href: "#page-header", mono: true }
          ]}
          maxItems={3}
          badges={
            <>
              <Badge tone="warn">Production</Badge>
              <Badge>v14</Badge>
            </>
          }
          description="Rotated 12 days ago by Sarah Lin."
          actions={<Button variant="outline">Rotate</Button>}
          tabs={
            <Tabs
              label="Secret sections"
              tabs={[
                { value: "overview", label: "Overview", content: null },
                { value: "versions", label: "Versions", count: 14, content: null },
                { value: "syncs", label: "Syncs", count: 3, content: null }
              ]}
            />
          }
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
