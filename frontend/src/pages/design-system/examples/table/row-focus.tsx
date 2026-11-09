import * as React from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@app/components/v4/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { SmallText } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

type Secret = { id: string; name: string; tags: string[] };

const secrets: Secret[] = [
  { id: "stripe", name: "STRIPE_API_KEY", tags: ["billing"] },
  { id: "database", name: "DATABASE_URL", tags: ["core", "rotated"] },
  { id: "sentry", name: "SENTRY_DSN", tags: [] },
  { id: "redis", name: "REDIS_PASSWORD", tags: ["core"] }
];

const environments = [
  { id: "development", name: "Development", tags: ["local"] },
  { id: "staging", name: "Staging", tags: [] },
  { id: "production", name: "Production", tags: ["pci"] }
];

function TagEditor({
  label,
  tags,
  open,
  onOpenChange
}: {
  label: string;
  tags: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs">
          {tags.length ? tags.join(", ") : "Add tags"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>{`Tags on ${label}`}</PopoverTitle>
        </PopoverHeader>
        <div className="flex flex-wrap gap-2">
          {tags.length ? tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : "No tags yet"}
        </div>
        <Button onClick={() => onOpenChange(false)}>Done</Button>
      </PopoverContent>
    </Popover>
  );
}

function DimAmount() {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [value, setValue] = React.useState("");
  React.useLayoutEffect(() => {
    if (ref.current)
      setValue(getComputedStyle(ref.current).getPropertyValue("--v4-opacity-row-dim").trim());
  }, []);
  return (
    <SmallText muted>
      <span ref={ref}>
        <code>opacity-row-dim</code> {value}
      </span>
    </SmallText>
  );
}

export default function RowFocusExample() {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [nested, setNested] = React.useState<string | null>(null);
  const toggle = (set: (id: string | null) => void, id: string) => (open: boolean) =>
    set(open ? id : null);
  const columns: DataTableColumn<Secret>[] = [
    { id: "name", header: "Name", primary: true, grow: true, render: (row) => row.name },
    {
      id: "tags",
      header: "Tags",
      width: 220,
      render: (row) => (
        <TagEditor
          label={row.name}
          tags={row.tags}
          open={editing === row.id}
          onOpenChange={toggle(setEditing, row.id)}
        />
      )
    }
  ];
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Editing a row's tags focuses it; the other rows dim">
        <DimAmount />
        <DataTable
          label="Secrets"
          rows={secrets}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          focusedRowId={editing ?? undefined}
        />
      </ExampleCell>
      <ExampleCell
        align="stretch"
        label="Nested: focusing an environment row dims the outer rows too, not its secret"
      >
        <Table aria-label="Secrets by environment">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col">Environments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>STRIPE_API_KEY</TableCell>
              <TableCell>3 of 3</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>DATABASE_URL</TableCell>
              <TableCell>3 of 3</TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={2}>
                <Table aria-label="DATABASE_URL by environment">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Environment</TableHead>
                      <TableHead scope="col">Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {environments.map((environment) => (
                      <TableRow key={environment.id} focused={nested === environment.id}>
                        <TableCell>{environment.name}</TableCell>
                        <TableCell>
                          <TagEditor
                            label={`DATABASE_URL in ${environment.name}`}
                            tags={environment.tags}
                            open={nested === environment.id}
                            onOpenChange={toggle(setNested, environment.id)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>SENTRY_DSN</TableCell>
              <TableCell>2 of 3</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </ExampleCell>
    </ExampleGrid>
  );
}
