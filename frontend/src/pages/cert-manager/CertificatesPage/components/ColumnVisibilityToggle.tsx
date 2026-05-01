import { Columns3Icon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v3";

export type ColumnDef = {
  key: string;
  label: string;
  defaultVisible: boolean;
};

export const INVENTORY_COLUMNS: ColumnDef[] = [
  { key: "sanCn", label: "SAN / CN", defaultVisible: true },
  { key: "serialNumber", label: "Serial Number", defaultVisible: true },
  { key: "enrollmentMethod", label: "Enrollment Method", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "health", label: "Health", defaultVisible: true },
  { key: "issuedAt", label: "Issued", defaultVisible: true },
  { key: "expiresAt", label: "Expires", defaultVisible: true },
  { key: "ca", label: "CA", defaultVisible: true },
  { key: "profile", label: "Profile", defaultVisible: true },
  { key: "algorithm", label: "Algorithm", defaultVisible: true },
  { key: "source", label: "Source", defaultVisible: false }
];

const STORAGE_KEY_PREFIX = "cert-inventory-columns";

const getStorageKey = (projectId: string) => `${STORAGE_KEY_PREFIX}:${projectId}`;

export const getDefaultVisibleColumns = (projectId: string): Set<string> => {
  try {
    const stored = localStorage.getItem(getStorageKey(projectId));
    if (stored) {
      return new Set(JSON.parse(stored) as string[]);
    }
  } catch {
    // ignore
  }
  return new Set(INVENTORY_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
};

export const saveVisibleColumns = (columns: Set<string>, projectId: string) => {
  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify([...columns]));
  } catch {
    // ignore
  }
};

type Props = {
  visibleColumns: Set<string>;
  onChange: (columns: Set<string>) => void;
  projectId: string;
};

export const ColumnVisibilityToggle = ({ visibleColumns, onChange, projectId }: Props) => {
  const allColumnKeys = INVENTORY_COLUMNS.map((c) => c.key);
  const allVisible = visibleColumns.size === INVENTORY_COLUMNS.length;

  const MIN_COLUMN = "sanCn";

  const handleToggleAll = () => {
    const next = allVisible ? new Set<string>([MIN_COLUMN]) : new Set(allColumnKeys);
    onChange(next);
    saveVisibleColumns(next, projectId);
  };

  const handleToggle = (key: string) => {
    const next = new Set(visibleColumns);
    if (next.has(key)) {
      if (next.size <= 1) return;
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
    saveVisibleColumns(next, projectId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="relative">
          <IconButton
            variant={!allVisible ? "project" : "outline"}
            size="md"
            aria-label="Toggle columns"
          >
            <Columns3Icon />
          </IconButton>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={2} className="w-52" align="end">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={allVisible}
          onCheckedChange={handleToggleAll}
          onSelect={(e) => e.preventDefault()}
        >
          {allVisible ? "Hide All" : "Show All"}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {INVENTORY_COLUMNS.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.key}
            checked={visibleColumns.has(col.key)}
            onCheckedChange={() => handleToggle(col.key)}
            onSelect={(e) => e.preventDefault()}
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
