import { ClipboardCopyIcon, DownloadIcon } from "lucide-react";

import { Button } from "@app/components/v3/generic/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v3/generic/Dropdown";

import type { ExportFormat } from "../data-export";

type Props = {
  onExport: (format: ExportFormat) => void;
  onCopy: (format: ExportFormat) => void;
  disabled?: boolean;
};

export function ExportDropdown({ onExport, onCopy, disabled }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" disabled={disabled} title="Export">
          <DownloadIcon />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onExport("csv")}>
          <DownloadIcon className="size-3.5" />
          Download as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("json")}>
          <DownloadIcon className="size-3.5" />
          Download as JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onCopy("csv")}>
          <ClipboardCopyIcon className="size-3.5" />
          Copy as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCopy("json")}>
          <ClipboardCopyIcon className="size-3.5" />
          Copy as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
