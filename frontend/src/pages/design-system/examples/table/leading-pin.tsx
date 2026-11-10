import * as React from "react";

import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { DataTable, type DataTableColumn, EnvMark } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@app/components/v4/ui/popover";
import {
  RowActions,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeadButton,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const environments = [
  "Development",
  "Staging",
  "QA",
  "UAT",
  "Performance",
  "Sandbox",
  "Demo",
  "Preview",
  "Canary",
  "Production US",
  "Production EU",
  "Production AP"
];

type Secret = { id: string; name: string; present: number[] };

const secrets: Secret[] = [
  { id: "stripe", name: "STRIPE_API_KEY", present: [0, 1, 2, 9, 10, 11] },
  { id: "database", name: "DATABASE_URL", present: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: "sentry", name: "SENTRY_DSN", present: [1, 9, 10] },
  { id: "redis", name: "REDIS_PASSWORD", present: [0, 1, 3, 9] },
  { id: "jwt", name: "JWT_SIGNING_SECRET", present: [0, 1, 2, 3, 9, 10, 11] },
  { id: "smtp", name: "SMTP_PASSWORD", present: [9, 10, 11] }
];

const copyAction = (name: string) => ({
  label: `Copy ${name}`,
  icon: "copy" as const,
  onSelect: () => navigator.clipboard?.writeText(name)
});

function ValueEditor({
  label,
  open,
  onOpenChange
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs">
          ••••••••
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>{label}</PopoverTitle>
        </PopoverHeader>
        <Button onClick={() => onOpenChange(false)}>Done</Button>
      </PopoverContent>
    </Popover>
  );
}

function Matrix() {
  const [selected, setSelected] = React.useState<string[]>(["stripe"]);
  const [expanded, setExpanded] = React.useState<string | null>("database");
  const [editing, setEditing] = React.useState<string | null>(null);
  const [descending, setDescending] = React.useState(false);
  const ordered = [...secrets].sort((a, b) => a.name.localeCompare(b.name) * (descending ? -1 : 1));
  const allState = () => {
    if (selected.length === secrets.length) return true;
    return selected.length > 0 ? "indeterminate" : false;
  };
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  return (
    <Table aria-label="Secrets across twelve environments">
      <TableHeader>
        <TableRow>
          <TableHead selection pin="start">
            <Checkbox
              aria-label="Select every secret"
              checked={allState()}
              onCheckedChange={() =>
                setSelected(
                  selected.length === secrets.length ? [] : secrets.map((secret) => secret.id)
                )
              }
            />
          </TableHead>
          <TableHead scope="col" pin="start" aria-sort={descending ? "descending" : "ascending"}>
            <TableHeadButton data-active onClick={() => setDescending(!descending)}>
              Name
              <Icon name={descending ? "arrow-down" : "arrow-up"} />
            </TableHeadButton>
          </TableHead>
          {environments.map((environment) => (
            <TableHead key={environment} scope="col">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <TableHeadButton>
                    {environment}
                    <Icon name="chev-down" />
                  </TableHeadButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem>Sort by last change</DropdownMenuItem>
                  <DropdownMenuItem>{`Hide ${environment}`}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
          ))}
          <TableActionsHead slots={1} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordered.map((secret) => (
          <React.Fragment key={secret.id}>
            <RowContextMenu label={secret.name} inline={[copyAction(secret.name)]}>
              <TableRow data-state={selected.includes(secret.id) ? "selected" : undefined}>
                <TableCell selection pin="start">
                  <Checkbox
                    aria-label={`Select ${secret.name}`}
                    checked={selected.includes(secret.id)}
                    onCheckedChange={() => toggle(secret.id)}
                  />
                </TableCell>
                <TableCell pin="start">
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={expanded === secret.id ? "chev-down" : "chev-right"}
                    aria-expanded={expanded === secret.id}
                    onClick={() => setExpanded(expanded === secret.id ? null : secret.id)}
                  >
                    {secret.name}
                  </Button>
                </TableCell>
                {environments.map((environment, index) => (
                  <TableCell key={environment}>
                    <EnvMark env={environment} present={secret.present.includes(index)} />
                  </TableCell>
                ))}
                <TableActionsCell slots={1}>
                  <RowActions label={secret.name} inline={[copyAction(secret.name)]} />
                </TableActionsCell>
              </TableRow>
            </RowContextMenu>
            {expanded === secret.id && (
              <TableRow>
                <TableCell pin="viewport" colSpan={environments.length + 3}>
                  <div>
                    <Table aria-label={`${secret.name} by environment`}>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Environment</TableHead>
                          <TableHead scope="col">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {environments.slice(0, 4).map((environment) => (
                          <TableRow
                            key={environment}
                            focused={editing === `${secret.id}:${environment}`}
                          >
                            <TableCell>
                              <span>{environment}</span>
                            </TableCell>
                            <TableCell>
                              <ValueEditor
                                label={`${secret.name} in ${environment}`}
                                open={editing === `${secret.id}:${environment}`}
                                onOpenChange={(open) =>
                                  setEditing(open ? `${secret.id}:${environment}` : null)
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </React.Fragment>
        ))}
        <TableRow>
          <TableCell selection pin="start" />
          <TableCell pin="start">
            <Input aria-label="New secret name" placeholder="Add a secret name" />
          </TableCell>
          <TableCell colSpan={environments.length + 1}>
            <Input aria-label="New secret value" placeholder="Add a secret value" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export default function LeadingPinExample() {
  const columns: DataTableColumn<Secret>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      pin: "start",
      width: 220,
      render: (row) => row.name
    },
    ...environments.map((environment, index): DataTableColumn<Secret> => ({
      id: environment,
      header: environment,
      width: 128,
      render: (row) => <EnvMark env={environment} present={row.present.includes(index)} />
    }))
  ];
  return (
    <ExampleGrid width="full">
      <ExampleCell
        align="stretch"
        label="Native Table: selection and Name pinned at the start, actions at the end, an expanded row's full-width cell"
      >
        <Matrix />
      </ExampleCell>
      <ExampleCell
        align="stretch"
        label="DataTable, striped: a start-pinned Name column after selection"
      >
        <DataTable
          label="Secrets across twelve environments"
          variant="striped"
          rows={secrets}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          selectable
          defaultSelectedIds={["database"]}
          rowActions={{ inline: [{ label: "Copy name", icon: "copy", onSelect: () => undefined }] }}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
