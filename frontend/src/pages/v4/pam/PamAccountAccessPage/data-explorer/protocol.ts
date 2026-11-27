export type DataExplorerClientMessage =
  | { type: "get-schemas"; id: string }
  | { type: "get-tables"; id: string; schema: string }
  | { type: "get-table-detail"; id: string; connectionId: string; schema: string; table: string }
  | { type: "query"; id: string; connectionId: string; sql: string }
  | { type: "cancel"; connectionId: string }
  | { type: "open-connection"; id: string }
  | { type: "close-connection"; connectionId: string }
  | { type: "activity" };

export type SchemaInfo = { name: string };

export type TableInfo = { name: string; tableType: string };

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

export type FieldInfo = { name: string };

export type QueryResult = {
  rows: Record<string, unknown>[];
  fields: FieldInfo[];
  rowCount: number | null;
  isTruncated: boolean;
  transactionOpen: boolean;
  command: string;
  executionTimeMs: number;
};

export type DataExplorerServerMessage =
  | { type: "schemas"; id: string; data: SchemaInfo[] }
  | { type: "tables"; id: string; data: TableInfo[] }
  | {
      type: "table-detail";
      id: string;
      connectionId: string;
      transactionOpen: boolean;
      data: TableDetail;
    }
  | ({ type: "query-result"; id: string; connectionId: string } & QueryResult)
  | {
      type: "error";
      id: string;
      connectionId?: string;
      transactionOpen?: boolean;
      error: string;
      detail?: string;
      hint?: string;
    }
  | {
      type: "connection-opened";
      id: string;
      connectionId: string;
      nativeConnectionId: number | null;
    }
  | { type: "connection-open-failed"; id: string; error: string }
  | { type: "connection-closed"; connectionId: string; reason: string }
  | { type: "ready" }
  | { type: "session_end"; reason: string };
