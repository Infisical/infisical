// WebSocket message types for the Postgres Data Explorer

export type DataExplorerClientMessage =
  | { type: "get-schemas"; id: string }
  | { type: "get-tables"; id: string; schema: string }
  | { type: "get-table-detail"; id: string; schema: string; table: string }
  | { type: "query"; id: string; sql: string };

export type DataExplorerServerMessage =
  | { type: "schemas"; id: string; data: SchemaInfo[] }
  | { type: "tables"; id: string; data: TableInfo[] }
  | { type: "table-detail"; id: string; data: TableDetail }
  | {
      type: "query-result";
      id: string;
      rows: Record<string, unknown>[];
      fields: FieldInfo[];
      rowCount: number | null;
      isTruncated: boolean;
      command: string;
      executionTimeMs: number;
    }
  | { type: "error"; id: string; error: string; detail?: string; hint?: string }
  // Lifecycle messages (reused from terminal)
  | { type: "ready"; data: string; prompt: string }
  | { type: "session_end"; reason: string };

export type SchemaInfo = {
  name: string;
};

export type TableInfo = {
  name: string;
  tableType: string;
};

export type ColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  identityGeneration: string | null;
};

export type ForeignKeyInfo = {
  constraintName: string;
  columns: string[];
  targetSchema: string;
  targetTable: string;
  targetColumns: string[];
};

export type TableDetail = {
  columns: ColumnInfo[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyInfo[];
};

export type FieldInfo = {
  name: string;
};
