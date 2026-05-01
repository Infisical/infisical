// WebSocket message types for the Postgres Data Explorer

export type DataExplorerClientMessage =
  // Metadata (no connectionId) — served by short-lived BE pg.Clients
  | { type: "get-schemas"; id: string }
  | { type: "get-tables"; id: string; schema: string }
  // Tab-scoped — routed to a specific BE controller
  | { type: "get-table-detail"; id: string; connectionId: string; schema: string; table: string }
  | { type: "query"; id: string; connectionId: string; sql: string }
  // Cancel is fire-and-forget; gains connectionId for routing but not id
  | { type: "cancel"; connectionId: string }
  // Lifecycle
  | { type: "open-connection"; id: string }
  | { type: "close-connection"; connectionId: string }
  // Keepalive sent while the browser tab is visible; resets the BE idle timer
  | { type: "activity" };

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
  | {
      type: "query-result";
      id: string;
      connectionId: string;
      rows: Record<string, unknown>[];
      fields: FieldInfo[];
      rowCount: number | null;
      isTruncated: boolean;
      transactionOpen: boolean;
      command: string;
      executionTimeMs: number;
    }
  | {
      type: "error";
      id: string;
      connectionId?: string;
      transactionOpen?: boolean;
      error: string;
      detail?: string;
      hint?: string;
    }
  | { type: "connection-opened"; id: string; connectionId: string; backendPid: number | null }
  | { type: "connection-open-failed"; id: string; error: string }
  | { type: "connection-closed"; connectionId: string; reason: string }
  | { type: "ready" }
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
