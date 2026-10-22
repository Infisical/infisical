import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { Input } from "@app/components/v4/ui/input";
import { Media } from "@app/components/v4/ui/item";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Select } from "@app/components/v4/ui/select";

import { Shell, useCrumbs } from "./shared";

type SecretRow = { id: string; name: string; folder?: boolean };
const secretRows: SecretRow[] = [
  { id: "billing", name: "billing", folder: true },
  { id: "webhooks", name: "webhooks", folder: true },
  ...[
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "CHECKOUT_TIMEOUT_MS",
    "DATABASE_URL",
    "FEATURE_FLAGS_URL",
    "JWT_SIGNING_KEY",
    "LOG_LEVEL",
    "REDIS_URL",
    "SMTP_PASSWORD",
    "STRIPE_API_KEY",
    "STRIPE_WEBHOOK_SECRET"
  ].map((name) => ({ id: name, name }))
];
const secretColumns: DataTableColumn<SecretRow>[] = [
  {
    id: "name",
    header: "Name",
    primary: true,
    sortable: true,
    width: 520,
    text: (r) => r.name,
    render: (r) => (
      <Inline gap={8} align="center">
        <Media icon={r.folder ? "folder" : "key"} size="sm" />
        {r.folder ? r.name : <code>{r.name}</code>}
      </Inline>
    )
  },
  { id: "value", header: "Value", grow: true, render: (r) => (r.folder ? "" : "••••••••••••••••") },
  {
    id: "actions",
    header: "Actions",
    actions: true,
    hideHeader: true,
    render: (r) => (
      <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
        {`Actions for ${r.name}`}
      </Button>
    )
  }
];
export default function Secrets() {
  const [env, setEnv] = useState("dev");
  const { org, product, project } = useCrumbs();
  return (
    <Shell level="project" current="secrets" crumbs={[org, product, project]}>
      <Stack gap={24}>
        <PageHeader
          title="payments-api"
          mono
          description="Billing and checkout service"
          actions={
            <>
              <Button variant="outline" icon="download">
                Download
              </Button>
              <Button variant="primary" icon="plus">
                Add secret
              </Button>
            </>
          }
        />
        <Inline gap={8}>
          <div style={{ width: 200 }}>
            <Select
              aria-label="Environment"
              options={[
                { value: "dev", label: "Development" },
                { value: "staging", label: "Staging" },
                { value: "prod", label: "Production" }
              ]}
              value={env}
              onChange={setEnv}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Input icon="search" placeholder="Search by secret or folder name" kbd="/" />
          </div>
        </Inline>
        <DataTable
          label="Secrets in Development"
          rows={secretRows}
          columns={secretColumns}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.name}
          selectable
          sort={{ columnId: "name", direction: "asc" }}
          footer="2 folders, 11 secrets in Development at /"
        />
      </Stack>
    </Shell>
  );
}
