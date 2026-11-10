import { CodeXmlIcon, EditIcon, TagsIcon } from "lucide-react";

import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline } from "@app/components/v4/ui/layout";
import { toast } from "@app/components/v4/ui/sonner";
import {
  type RowActionList,
  RowActions as RowActionsGroup,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowIndicators
} from "@app/components/v4/ui/table";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

type Row = { id: string; name: string; annotated: boolean; rotated: boolean };
const rows: Row[] = [
  { id: "database-url", name: "DATABASE_URL", annotated: true, rotated: false },
  { id: "log-level", name: "LOG_LEVEL", annotated: false, rotated: false },
  { id: "jwt-signing-key", name: "JWT_SIGNING_KEY", annotated: false, rotated: true }
];

export default function RowActions() {
  const columns: DataTableColumn<Row>[] = [
    { id: "name", header: "Name", primary: true, grow: true, render: (row) => row.name },
    {
      id: "value",
      header: "Value",
      grow: true,
      render: (row) => (
        <Inline gap={8} wrap={false}>
          <code>••••••••••••</code>
          {row.annotated && (
            <TableRowIndicators>
              <span>
                <Icon icon={TagsIcon} label="Has tags" />
              </span>
              <span>
                <Icon icon={CodeXmlIcon} label="Has metadata" />
              </span>
            </TableRowIndicators>
          )}
        </Inline>
      )
    }
  ];
  const menu = (row: Row) => (
    <>
      <DropdownMenuItem onSelect={() => toast(`Opened ${row.name}.`)}>
        <Icon name="eye" />
        Open secret
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => toast(`Deleted ${row.name}.`)}>
        <Icon name="trash" />
        Delete secret
      </DropdownMenuItem>
    </>
  );
  const copy = {
    label: "Copy secret",
    icon: "copy",
    disabledReason: (row: Row) => (row.rotated ? "Cannot copy rotated secret" : undefined),
    onSelect: (row: Row) => toast(`Copied the fabricated value of ${row.name}.`)
  } as const;
  const reminder = {
    label: (row: Row) => (row.annotated ? "View reminder" : "Add reminder"),
    icon: "bell",
    onSelect: (row: Row) => toast(`Opened the reminder for ${row.name}.`)
  } as const;
  const edit = {
    label: "Edit value",
    icon: EditIcon,
    disabledReason: (row: Row) => (row.rotated ? "Rotated secrets can't be edited" : undefined),
    onSelect: (row: Row) => toast(`Editing ${row.name}.`)
  } as const;
  const say = (text: string) => () => toast(text);
  const mixed: { name: string; inline: RowActionList }[] = [
    { name: "api", inline: [] },
    {
      name: "workers",
      inline: [{ label: "Edit folder", icon: EditIcon, onSelect: say("Editing workers.") }]
    },
    {
      name: "DATABASE_URL",
      inline: [
        { label: "Add reminder", icon: "bell", onSelect: say("Reminder for DATABASE_URL.") },
        { label: "Edit value", icon: EditIcon, onSelect: say("Editing DATABASE_URL.") },
        { label: "Copy secret", icon: "copy", onSelect: say("Copied DATABASE_URL.") }
      ]
    },
    {
      name: "LOG_LEVEL",
      inline: [
        { label: "Edit value", icon: EditIcon, onSelect: say("Editing LOG_LEVEL.") },
        { label: "Copy secret", icon: "copy", onSelect: say("Copied LOG_LEVEL.") }
      ]
    }
  ];
  const sets: { label: string; actions: DataTableRowActions<Row> }[] = [
    { label: "More only, one square cell", actions: { renderMenu: menu } },
    { label: "One inline action and More", actions: { inline: [copy], renderMenu: menu } },
    {
      label: "Two inline actions and More",
      actions: { inline: [reminder, copy], renderMenu: menu }
    },
    {
      label: "Three inline actions, the cap, and More",
      actions: { inline: [reminder, edit, copy], renderMenu: menu }
    }
  ];
  return (
    <ExampleGrid width="full">
      {sets.map((set) => (
        <ExampleCell align="stretch" key={set.label} label={set.label}>
          <DataTable
            label={`Example secrets, ${set.label.toLowerCase()}`}
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            rowActions={set.actions}
          />
        </ExampleCell>
      ))}
      <ExampleCell
        align="stretch"
        label="Mixed counts in one table, each row end-aligned; right-click a row for the same actions"
      >
        <Table aria-label="Example folders and secrets, mixed action counts">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableActionsHead slots={4}>Actions</TableActionsHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mixed.map((row) => {
              const rowMenu = (
                <DropdownMenuItem onSelect={() => toast(`Opened ${row.name}.`)}>
                  <Icon name="eye" />
                  Open
                </DropdownMenuItem>
              );
              return (
                <RowContextMenu key={row.name} label={row.name} inline={row.inline} menu={rowMenu}>
                  <TableRow>
                    <TableCell>{row.name}</TableCell>
                    <TableActionsCell slots={4}>
                      <RowActionsGroup label={row.name} inline={row.inline} menu={rowMenu} />
                    </TableActionsCell>
                  </TableRow>
                </RowContextMenu>
              );
            })}
          </TableBody>
        </Table>
      </ExampleCell>
    </ExampleGrid>
  );
}
