import { Button } from "@infisical/cipher/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";

import { saved } from "../../../access/toast";
import { copyRows, type ExportFormat, exportRows } from "./export";

export const ExportMenu = ({
  rows,
  columns,
  disabledReason
}: {
  rows: Record<string, unknown>[];
  columns: string[];
  disabledReason?: string;
}) => {
  const copy = async (format: ExportFormat) => {
    if (!(await copyRows(rows, columns, format))) return;
    saved(`Copied ${rows.length} ${rows.length === 1 ? "row" : "rows"} as ${format.toUpperCase()}`);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" icon="download" disabledReason={disabledReason}>
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => exportRows(rows, columns, "csv")}>
          Download as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportRows(rows, columns, "json")}>
          Download as JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => copy("csv")}>Copy as CSV</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copy("json")}>Copy as JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
