import { Columns3Icon } from "lucide-react";

import {
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuLabel,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
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

const STORAGE_KEY = "cert-inventory-columns";

export const getDefaultVisibleColumns = (): Set<string> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return new Set(JSON.parse(stored) as string[]);
    }
  } catch {
    // ignore
  }
  return new Set(INVENTORY_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
};

export const saveVisibleColumns = (columns: Set<string>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...columns]));
  } catch {
    // ignore
  }
};

type Props = {
  visibleColumns: Set<string>;
  onChange: (columns: Set<string>) => void;
};

export const ColumnVisibilityToggle = ({ visibleColumns, onChange }: Props) => {
  const hasHiddenColumns = visibleColumns.size < INVENTORY_COLUMNS.length;

  const handleToggle = (key: string) => {
    const next = new Set(visibleColumns);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
    saveVisibleColumns(next);
  };

  return (
    <UnstableDropdownMenu>
      <UnstableDropdownMenuTrigger asChild>
        <div className="relative">
          <UnstableIconButton
            variant={hasHiddenColumns ? "project" : "outline"}
            size="md"
            aria-label="Toggle columns"
          >
            <Columns3Icon />
          </UnstableIconButton>
        </div>
      </UnstableDropdownMenuTrigger>
      <UnstableDropdownMenuContent sideOffset={2} className="w-52" align="end">
        <UnstableDropdownMenuLabel>Columns</UnstableDropdownMenuLabel>
        {INVENTORY_COLUMNS.map((col) => (
          <UnstableDropdownMenuCheckboxItem
            key={col.key}
            checked={visibleColumns.has(col.key)}
            onCheckedChange={() => handleToggle(col.key)}
          >
            {col.label}
          </UnstableDropdownMenuCheckboxItem>
        ))}
      </UnstableDropdownMenuContent>
    </UnstableDropdownMenu>
  );
};
