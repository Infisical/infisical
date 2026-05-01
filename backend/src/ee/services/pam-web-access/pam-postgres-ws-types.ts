import { z } from "zod";

export enum PostgresClientMessageType {
  Control = "control",
  GetSchemas = "get-schemas",
  GetTables = "get-tables",
  GetTableDetail = "get-table-detail",
  Query = "query",
  Cancel = "cancel",
  OpenConnection = "open-connection",
  CloseConnection = "close-connection",
  Activity = "activity"
}

export enum PostgresServerMessageType {
  Schemas = "schemas",
  Tables = "tables",
  TableDetail = "table-detail",
  QueryResult = "query-result",
  Error = "error",
  ConnectionOpened = "connection-opened",
  ConnectionOpenFailed = "connection-open-failed",
  ConnectionClosed = "connection-closed"
}

// --- Shared bases ---

const CorrelatedBaseSchema = z.object({ id: z.string().uuid() });
const TabScopedBaseSchema = CorrelatedBaseSchema.extend({ connectionId: z.string().uuid() });

// =====================================================================
// Client messages (client → server) — single flat discriminated union
// =====================================================================

const ControlSchema = z.object({ type: z.literal(PostgresClientMessageType.Control), data: z.string() });

// Metadata messages — not connectionId-scoped; served by one-shot pg.Clients.
const GetSchemasRequestSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.GetSchemas)
});

const GetTablesRequestSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.GetTables),
  schema: z.string()
});

// Tab-scoped messages — carry connectionId; routed to a specific controller.
const GetTableDetailRequestSchema = TabScopedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.GetTableDetail),
  schema: z.string(),
  table: z.string()
});

const QueryRequestSchema = TabScopedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.Query),
  sql: z.string().max(50 * 1024)
});

// Cancel stays fire-and-forget; gains connectionId for routing but not id.
const CancelSchema = z.object({
  type: z.literal(PostgresClientMessageType.Cancel),
  connectionId: z.string().uuid()
});

// Lifecycle — open/close tab controllers.
const OpenConnectionSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.OpenConnection)
});

const CloseConnectionSchema = z.object({
  type: z.literal(PostgresClientMessageType.CloseConnection),
  connectionId: z.string().uuid()
});

// Fire-and-forget heartbeat sent by the FE while the browser tab is visible, so
// the server-side idle timer only fires on truly inactive tabs — not on active
// read-only sessions that don't happen to send queries.
const ActivitySchema = z.object({
  type: z.literal(PostgresClientMessageType.Activity)
});

export const PostgresClientMessageSchema = z.discriminatedUnion("type", [
  ControlSchema,
  GetSchemasRequestSchema,
  GetTablesRequestSchema,
  GetTableDetailRequestSchema,
  QueryRequestSchema,
  CancelSchema,
  OpenConnectionSchema,
  CloseConnectionSchema,
  ActivitySchema
]);

export type TPostgresClientMessage = z.infer<typeof PostgresClientMessageSchema>;

// =====================================================================
// Server messages (server → client) — correlated request/response schemas.
// Lifecycle messages (ready / session_end) travel on the shared
// TerminalServerMessageType channel defined in pam-web-access-types.ts.
// =====================================================================

const SchemasResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.Schemas),
  data: z.array(z.object({ name: z.string() }))
});

const TablesResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.Tables),
  data: z.array(z.object({ name: z.string(), tableType: z.string() }))
});

const TableDetailResponseSchema = TabScopedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.TableDetail),
  transactionOpen: z.boolean(),
  data: z.object({
    columns: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        // Left commented out so the schema doesn't have to be modified if the UI ever needs these standard catalog values
        // typeOid: z.number(),
        nullable: z.boolean(),
        // Left commented out so the schema doesn't have to be modified if the UI ever needs these standard catalog values
        // defaultValue: z.string().nullable(),
        // isIdentity: z.boolean(),
        identityGeneration: z.string().nullable()
        // Left commented out so the schema doesn't have to be modified if the UI ever needs these standard catalog values
        // isArray: z.boolean(),
        // maxLength: z.number().nullable()
      })
    ),
    primaryKeys: z.array(z.string()),
    foreignKeys: z.array(
      z.object({
        constraintName: z.string(),
        columns: z.array(z.string()),
        targetSchema: z.string(),
        targetTable: z.string(),
        targetColumns: z.array(z.string())
      })
    )
    // Left commented out so the schema doesn't have to be modified if the UI ever needs these standard catalog values
    // enums: z.record(z.string(), z.array(z.string()))
  })
});

const QueryResultResponseSchema = TabScopedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.QueryResult),
  rows: z.array(z.record(z.string(), z.unknown())),
  fields: z.array(
    z.object({
      name: z.string()
      // Left commented out so the schema doesn't have to be modified if the UI ever needs this standard catalog value
      // dataTypeID: z.number()
    })
  ),
  rowCount: z.number().nullable(),
  isTruncated: z.boolean(),
  transactionOpen: z.boolean(),
  command: z.string(),
  executionTimeMs: z.number()
});

// Error responses carry transactionOpen for tab-scoped errors so the FE banner
// stays in sync after auto-rollback. connectionId is optional because errors
// can come from metadata requests (no connectionId) or unknown-connectionId
// cases tied to a request id.
const ErrorResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.Error),
  connectionId: z.string().uuid().optional(),
  transactionOpen: z.boolean().optional(),
  error: z.string(),
  detail: z.string().optional(),
  hint: z.string().optional()
});

// Lifecycle responses.
const ConnectionOpenedResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.ConnectionOpened),
  connectionId: z.string().uuid(),
  backendPid: z.number().nullable()
});

const ConnectionOpenFailedResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.ConnectionOpenFailed),
  error: z.string()
});

// Informational — BE pushes this when a controller dies outside clean dispose.
const ConnectionClosedResponseSchema = z.object({
  type: z.literal(PostgresServerMessageType.ConnectionClosed),
  connectionId: z.string().uuid(),
  reason: z.string()
});

export type TPostgresCorrelatedServerMessage = z.infer<
  | typeof SchemasResponseSchema
  | typeof TablesResponseSchema
  | typeof TableDetailResponseSchema
  | typeof QueryResultResponseSchema
  | typeof ErrorResponseSchema
  | typeof ConnectionOpenedResponseSchema
  | typeof ConnectionOpenFailedResponseSchema
  | typeof ConnectionClosedResponseSchema
>;
