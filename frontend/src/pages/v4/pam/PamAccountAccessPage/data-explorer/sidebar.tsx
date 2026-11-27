import { useState } from "react";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { Select } from "@infisical/cipher/ui/select";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { TableIcon } from "lucide-react";

import type { SchemaInfo, TableInfo } from "./protocol";

const isView = (tableType: string) => tableType === "view" || tableType === "materialized_view";

export const ExplorerSidebar = ({
  schemas,
  selectedSchema,
  onSchemaChange,
  tables,
  activeTable,
  onTableOpen,
  isLoadingSchemas,
  isLoadingTables,
  disabled
}: {
  schemas: SchemaInfo[];
  selectedSchema: string;
  onSchemaChange: (schema: string) => void;
  tables: TableInfo[];
  activeTable: { schema: string; table: string } | null;
  onTableOpen: (table: string, options: { forceNew: boolean }) => void;
  isLoadingSchemas: boolean;
  isLoadingTables: boolean;
  disabled: boolean;
}) => {
  const [search, setSearch] = useState({ schema: selectedSchema, text: "" });
  const text = search.schema === selectedSchema ? search.text : "";
  const shown = tables.filter(({ name }) => name.toLowerCase().includes(text.toLowerCase()));

  return (
    <aside
      aria-label="Tables"
      style={{
        display: "flex",
        flexDirection: "column",
        width: 264,
        flexShrink: 0,
        minHeight: 0,
        borderInlineEnd: "var(--cipher-size-control-border) solid var(--cipher-line-soft)"
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--cipher-space-8)",
          padding: "var(--cipher-space-12)"
        }}
      >
        {isLoadingSchemas ? (
          <Skeleton style={{ height: "var(--cipher-size-control-sm)" }} />
        ) : (
          <Select
            aria-label="Schema"
            size="sm"
            icon="layout-grid"
            value={selectedSchema}
            disabled={disabled}
            onChange={onSchemaChange}
            options={schemas.map(({ name }) => ({ value: name, label: name }))}
          />
        )}
        <Input
          aria-label="Search tables"
          type="search"
          icon="search"
          placeholder="Search tables"
          value={text}
          onChange={(event) => setSearch({ schema: selectedSchema, text: event.target.value })}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 var(--cipher-space-4)" }}>
        <List
          label={`Tables in ${selectedSchema}`}
          variant="bare"
          size="sm"
          loading={isLoadingTables && tables.length === 0}
          loadingRows={8}
          empty={text ? "No matching tables" : "No tables in this schema"}
        >
          {shown.map(({ name, tableType }) => (
            <ListRow
              key={name}
              value={name}
              label={name}
              title={name}
              media={<Icon icon={isView(tableType) ? "eye" : TableIcon} />}
              current={activeTable?.schema === selectedSchema && activeTable.table === name}
              disabled={disabled}
              onClick={(event) => onTableOpen(name, { forceNew: event.metaKey || event.ctrlKey })}
            />
          ))}
        </List>
      </div>
    </aside>
  );
};
