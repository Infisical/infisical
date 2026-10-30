import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import { RowLink } from "@app/components/v4/ui/row-link";
import { SmallText } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

type Page = { id: string; title: string; icon: string; status: string; ready: boolean };
const pages: Page[] = [
  { id: "detail", title: "Detail", icon: "Infisical.png", status: "Data display", ready: true },
  {
    id: "documentation-link-badge",
    title: "Documentation link badge",
    icon: "GitHub.png",
    status: "Navigation",
    ready: true
  },
  {
    id: "provider-icon",
    title: "Provider icon",
    icon: "Amazon Web Services.png",
    status: "Data display",
    ready: true
  },
  {
    id: "unreleased",
    title: "Unreleased page, not linked yet",
    icon: "Kafka.png",
    status: "Draft",
    ready: false
  }
];

export default function Example() {
  const columns: DataTableColumn<Page>[] = [
    {
      id: "title",
      header: "Page",
      grow: true,
      text: (row) => row.title,
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <ProviderIcon icon={row.icon} alt="" />
          <RowLink to="/design-system" hash={row.id} disabled={!row.ready} title={row.title}>
            {row.title}
          </RowLink>
        </div>
      )
    },
    {
      id: "status",
      header: "Group",
      width: 140,
      render: (row) => <Badge tone={row.ready ? "soft" : "warn"}>{row.status}</Badge>
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      width: 52,
      render: (row) => (
        <Button
          variant="ghost"
          size="icon-row"
          icon="copy"
          iconOnly
          onClick={() => navigator.clipboard.writeText(row.id)}
        >
          {`Copy the id of ${row.title}`}
        </Button>
      )
    }
  ];
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="DataTable rows open their page; the last row is disabled">
        <DataTable
          label="Workbench pages"
          rows={pages}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.title}
        />
      </ExampleCell>
      <ExampleCell
        align="stretch"
        label="Card opens the Detail page; the copy button keeps its own click"
      >
        <Card>
          <div className="flex items-center gap-3">
            <ProviderIcon icon="Infisical.png" alt="" size="xl" />
            <div className="min-w-0 flex-1">
              <RowLink to="/design-system" hash="detail">
                Detail
              </RowLink>
              <SmallText muted>
                Stacked label and value pairs for the details of one resource.
              </SmallText>
            </div>
            <Button
              variant="ghost"
              size="icon-row"
              icon="copy"
              iconOnly
              onClick={() => navigator.clipboard.writeText("detail")}
            >
              Copy the id of Detail
            </Button>
          </div>
        </Card>
      </ExampleCell>
    </ExampleGrid>
  );
}
