import { useId, useRef, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { CodeBlock } from "@app/components/v4/ui/code-block";
import { DataGrid, type GridColumn } from "@app/components/v4/ui/data-grid";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger
} from "@app/components/v4/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { Field } from "@app/components/v4/ui/field";
import { FileTree } from "@app/components/v4/ui/file-tree";
import { Input } from "@app/components/v4/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v4/ui/input-group";
import { Item } from "@app/components/v4/ui/item";
import { List, ListRow } from "@app/components/v4/ui/list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v4/ui/select";
import { SensitiveEditor } from "@app/components/v4/ui/sensitive-editor";
import { Snippet } from "@app/components/v4/ui/snippet";
import { Heading, SmallText } from "@app/components/v4/ui/text";
import { Toggle } from "@app/components/v4/ui/toggle";

type SampleRow = { id: string; name: string; value: string };
type Connection = { id: string; name: string; environment: string; hostname: string; path: string };
type Detail =
  | { kind: "connection"; connection: Connection }
  | { kind: "value"; row: SampleRow }
  | { kind: "history" };
function getDetailTitle(detail: Detail | null) {
  if (detail?.kind === "connection") return detail.connection.name;
  if (detail?.kind === "value") return detail.row.name;
  return "Rotation history";
}
const initialConnection: Connection = {
  id: "payments",
  name: "Payments API",
  environment: "production",
  hostname: "vault.example.test",
  path: "/payments"
};
const rows: SampleRow[] = [
  { id: "timeout", name: "REQUEST_TIMEOUT", value: "30000" },
  { id: "region", name: "SERVICE_REGION", value: "eu-west-1" }
];
const gridColumns: GridColumn<SampleRow>[] = [
  { id: "name", header: "Key", width: 260, getValue: (row) => row.name },
  { id: "value", header: "Value", width: 240, getValue: (row) => row.value }
];

export function DensityBoard({ compact }: { compact: boolean }) {
  const id = useId();
  const title = compact ? "Default" : "Comfortable";
  const control = compact ? "sm" : "md";
  const [query, setQuery] = useState("");
  const nameControl = useRef<HTMLInputElement>(null);
  const pathControl = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialConnection.name);
  const [saved, setSaved] = useState(initialConnection);
  const [added, setAdded] = useState<Connection[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [hostnameDraft, setHostnameDraft] = useState(initialConnection.hostname);
  const [path, setPath] = useState("relative/path");
  const [nameError, setNameError] = useState("");
  const [hostnameError, setHostnameError] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const addConnection = (duplicate: boolean) => {
    const number = added.length + 1;
    const connection: Connection = {
      ...saved,
      id: `connection-${number}`,
      name: duplicate ? `${saved.name} copy ${number}` : `Connection ${number}`
    };
    setAdded([...added, connection]);
    setQuery("");
    setNotice(`${connection.name} added locally.`);
  };
  const displayedConnections = [saved, ...added].filter((connection) =>
    connection.name.toLowerCase().includes(query.toLowerCase())
  );
  const tableColumns: DataTableColumn<SampleRow>[] = [
    { id: "name", header: "Key", primary: true, render: (row) => row.name },
    { id: "value", header: "Value", render: (row) => row.value },
    {
      id: "action",
      header: "Action",
      actions: true,
      render: (row) => (
        <Button size={control} variant="ghost" onClick={() => setDetail({ kind: "value", row })}>
          Inspect
        </Button>
      )
    }
  ];
  const save = async () => {
    if (pending) return;
    if (!name.trim()) {
      setNameError("Enter a connection name.");
      nameControl.current?.focus();
      return;
    }
    if (!path.startsWith("/")) {
      pathControl.current?.focus();
      return;
    }
    setNameError("");
    setPending(true);
    setNotice("");
    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });
    setSaved((current) => ({ ...current, name: name.trim(), environment, path }));
    setPending(false);
    setNotice("Changes saved locally.");
  };
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-density-board={compact ? "compact" : "current"}
      className="flex flex-col gap-8"
    >
      <Heading id={`${id}-title`}>{title}</Heading>
      <section aria-labelledby={`${id}-controls`} className="flex flex-col gap-4">
        <Heading level={3} size="subsection" id={`${id}-controls`}>
          Actions and fields
        </Heading>
        <div className="flex flex-wrap items-center gap-2">
          <Button size={control} loading={pending} onClick={() => save()}>
            Save changes
          </Button>
          <Button
            size={control}
            variant="outline"
            onClick={() => {
              setName(saved.name);
              setEnvironment(saved.environment);
              setPath(saved.path);
              setNameError("");
              setNotice("");
            }}
          >
            Reset changes
          </Button>
          <Button
            size={control}
            variant="outline"
            icon="plus"
            iconOnly
            aria-label={`Add connection, ${title}`}
            onClick={() => addConnection(false)}
          >
            Add connection
          </Button>
          <Toggle size={control} variant="outline" aria-label={`Pin connection, ${title}`}>
            Pin
          </Toggle>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Connection name"
            description="Visible to project members."
            error={nameError || undefined}
          >
            <Input
              size={compact ? "sm" : "md"}
              ref={nameControl}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameError("");
                setNotice("");
              }}
              disabled={pending}
            />
          </Field>
          <Field label="Environment">
            <Select
              value={environment}
              onValueChange={(value) => {
                setEnvironment(value);
                setNotice("");
              }}
            >
              <SelectTrigger size={control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="archived" disabled>
                  Archived
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Filter connections">
            <InputGroup size={compact ? "sm" : "md"}>
              <InputGroupInput
                value={query}
                placeholder="Search connections"
                onChange={(event) => setQuery(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton onClick={() => setQuery("")} disabled={!query}>
                  Clear
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field
            label="Secret path"
            error={!path.startsWith("/") ? "Enter an absolute path." : undefined}
          >
            <Input
              size={compact ? "sm" : "md"}
              ref={pathControl}
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
                setNotice("");
              }}
              invalid={!path.startsWith("/")}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size={control} disabled>
            Unavailable
          </Button>
          <Button size={control} variant="outline" loading>
            Save changes
          </Button>
        </div>
        <p role="status" className="min-h-5 text-sm">
          {notice}
        </p>
      </section>
      <section aria-labelledby={`${id}-rows`} className="flex flex-col gap-4">
        <Heading level={3} size="subsection" id={`${id}-rows`}>
          Rows and data
        </Heading>
        <Item
          title={saved.name}
          description={`${saved.environment === "production" ? "Production" : "Staging"} connection`}
          meta="12 secrets"
          size={compact ? "xs" : "default"}
          actions={
            <Button
              size={control}
              variant="outline"
              onClick={() => setDetail({ kind: "connection", connection: saved })}
            >
              Inspect
            </Button>
          }
        />
        <List
          label={`Connections, ${title}`}
          variant="plain"
          size={compact ? "sm" : "md"}
          selection="multiple"
        >
          {displayedConnections.map((connection) => (
            <ListRow
              key={connection.id}
              value={connection.id}
              title={connection.name}
              label={connection.name}
              meta={connection.environment === "production" ? "Production" : "Staging"}
              actions={
                <Button
                  size={control}
                  variant="ghost"
                  onClick={() => setDetail({ kind: "connection", connection })}
                >
                  Inspect
                </Button>
              }
            />
          ))}
          {"Archived connection".toLowerCase().includes(query.toLowerCase()) && (
            <ListRow
              value="archive"
              title="Archived connection"
              label="Archived connection"
              disabled
              meta="Read only"
            />
          )}
        </List>
        <DataTable
          label={`Managed values, ${title}`}
          rows={rows}
          columns={tableColumns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
        />
        <DataGrid
          label={`Technical values, ${title}`}
          rows={rows}
          columns={gridColumns}
          getRowId={(row) => row.id}
          height={120}
        />
        <FileTree
          label={`Configuration files, ${title}`}
          size={compact ? "sm" : "md"}
          items={[
            {
              id: "config",
              name: "config",
              children: [{ id: "production", name: "production.env", meta: "12 keys" }]
            }
          ]}
          defaultExpanded={["config"]}
        />
      </section>
      <section aria-labelledby={`${id}-content`} className="flex flex-col gap-4">
        <Heading level={3} size="subsection" id={`${id}-content`}>
          Content and technical values
        </Heading>
        <Card
          title="Rotation policy"
          description="Production credentials"
          variant="plain"
          size={compact ? "sm" : "default"}
          footer={
            <Button size={control} variant="outline" onClick={() => setDetail({ kind: "history" })}>
              View history
            </Button>
          }
        >
          <SmallText>Credentials rotate every 30 days.</SmallText>
        </Card>
        <Card
          title="Rotation policy"
          description="Production credentials"
          variant="framed"
          size={compact ? "sm" : "default"}
        >
          <SmallText>Credentials rotate every 30 days.</SmallText>
        </Card>
        <Snippet
          label={`Install command, ${title}`}
          size={compact ? "sm" : "md"}
          value="infisical run --env=production -- npm start"
        />
        <CodeBlock
          label="production.env"
          code={`REQUEST_TIMEOUT=30000\nSERVICE_REGION=eu-west-1\nSERVICE_HOST=${saved.hostname}\nSERVICE_PATH=${saved.path}`}
        />
        <SensitiveEditor
          label="API token"
          stored={{ id: `density-token-${id}`, revision: "1", hasValue: true }}
          onReveal={async () => "synthetic_token_123"}
          readOnly
        />
        <SmallText muted>Synthetic data. Changes stay in this example.</SmallText>
      </section>
      <section aria-labelledby={`${id}-overlays`} className="flex flex-col gap-4">
        <Heading level={3} size="subsection" id={`${id}-overlays`}>
          Menus and overlays
        </Heading>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size={control} variant="outline">
                Connection actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onSelect={() => setDetail({ kind: "connection", connection: saved })}
              >
                Inspect connection
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => addConnection(true)}>
                Duplicate connection
              </DropdownMenuItem>
              <DropdownMenuItem disabled>Archive connection</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              if (open) {
                setHostnameDraft(saved.hostname);
                setHostnameError("");
              }
              setDialogOpen(open);
            }}
          >
            <DialogTrigger asChild>
              <Button size={control} variant="outline">
                Edit connection
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Edit connection</DialogTitle>
              <DialogDescription>Change the hostname for this connection.</DialogDescription>
              <Field label="Hostname" error={hostnameError || undefined}>
                <Input
                  size={compact ? "sm" : "md"}
                  value={hostnameDraft}
                  onChange={(event) => setHostnameDraft(event.target.value)}
                />
              </Field>
              <DialogFooter>
                <Button size={control} variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size={control}
                  onClick={() => {
                    if (!hostnameDraft.trim()) {
                      setHostnameError("Enter a hostname.");
                      return;
                    }
                    setSaved((current) => ({ ...current, hostname: hostnameDraft.trim() }));
                    setNotice("Hostname saved locally.");
                    setDialogOpen(false);
                  }}
                >
                  Save changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>
      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{getDetailTitle(detail)}</DialogTitle>
          <DialogDescription>
            {detail?.kind === "history"
              ? "Recorded credential rotations."
              : "Stored local sample details."}
          </DialogDescription>
          {detail?.kind === "connection" && (
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt>Environment</dt>
                <dd>{detail.connection.environment}</dd>
              </div>
              <div>
                <dt>Hostname</dt>
                <dd>{detail.connection.hostname}</dd>
              </div>
              <div>
                <dt>Secret path</dt>
                <dd>{detail.connection.path}</dd>
              </div>
            </dl>
          )}
          {detail?.kind === "value" && (
            <CodeBlock label={detail.row.name} code={detail.row.value} />
          )}
          {detail?.kind === "history" && (
            <List label="Credential rotation history" variant="bare">
              <ListRow value="v3" title="Version 3" label="Version 3" meta="2026-10-16 09:00 UTC" />
              <ListRow value="v2" title="Version 2" label="Version 2" meta="2026-09-16 09:00 UTC" />
            </List>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
