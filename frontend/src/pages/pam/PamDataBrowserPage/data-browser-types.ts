// WebSocket message types for the Postgres Data Browser

export type DataBrowserClientMessage =
  | { type: "pg-get-schemas"; id: string }
  | { type: "pg-get-tables"; id: string; schema: string }
  | { type: "pg-get-table-detail"; id: string; schema: string; table: string }
  | { type: "pg-query"; id: string; sql: string };

export type DataBrowserServerMessage =
  | { type: "pg-schemas"; id: string; data: SchemaInfo[] }
  | { type: "pg-tables"; id: string; data: TableInfo[] }
  | { type: "pg-table-detail"; id: string; data: TableDetail }
  | {
      type: "pg-query-result";
      id: string;
      rows: Record<string, unknown>[];
      fields: FieldInfo[];
      rowCount: number | null;
      command: string;
      executionTimeMs: number;
    }
  | { type: "pg-error"; id: string; error: string; detail?: string; hint?: string }
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
  typeOid: number;
  nullable: boolean;
  defaultValue: string | null;
  isIdentity: boolean;
  identityGeneration: string | null;
  isArray: boolean;
  maxLength: number | null;
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
  enums: Record<string, string[]>;
};

export type FieldInfo = {
  name: string;
  dataTypeID: number;
};
