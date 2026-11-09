import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { Icon } from "@app/components/v4/ui/icon";
import { toast } from "@app/components/v4/ui/sonner";
import {
  type RowActionList,
  RowActions,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const names = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SIGNING_KEY",
  "SMTP_PASSWORD",
  "STRIPE_SECRET_KEY",
  "SENTRY_DSN",
  "S3_BUCKET",
  "LOG_LEVEL"
];

export default function LazyRowActions() {
  return (
    <ExampleGrid width="full">
      <ExampleCell
        align="stretch"
        label="Lazy row actions: plain buttons until a row is hovered or focused, then tooltips and the More menu"
      >
        <Table aria-label="Example secrets with lazy row actions">
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableActionsHead slots={2}>Actions</TableActionsHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {names.map((name) => {
              const inline: RowActionList = [
                {
                  label: "Copy secret",
                  icon: "copy",
                  disabledReason:
                    name === "JWT_SIGNING_KEY" ? "Cannot copy rotated secret" : undefined,
                  onSelect: () => toast(`Copied the fabricated value of ${name}.`)
                }
              ];
              const menu = (
                <>
                  <DropdownMenuItem onSelect={() => toast(`Opened ${name}.`)}>
                    <Icon name="eye" />
                    Open secret
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => toast(`Deleted ${name}.`)}
                  >
                    <Icon name="trash" />
                    Delete secret
                  </DropdownMenuItem>
                </>
              );
              return (
                <RowContextMenu key={name} label={name} inline={inline} menu={menu}>
                  <TableRow>
                    <TableCell>{name}</TableCell>
                    <TableActionsCell slots={2}>
                      <RowActions lazy label={name} inline={inline} menu={menu} />
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
