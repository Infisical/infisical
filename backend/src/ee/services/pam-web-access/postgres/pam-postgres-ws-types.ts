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

const CorrelatedBaseSchema = z.object({ id: z.string().uuid() });
const TabScopedBaseSchema = CorrelatedBaseSchema.extend({ connectionId: z.string().uuid() });

const ControlSchema = z.object({ type: z.literal(PostgresClientMessageType.Control), data: z.string() });

const GetSchemasRequestSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.GetSchemas)
});

const GetTablesRequestSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.GetTables),
  schema: z.string()
});

const GetTableDetailRequestSchema = TabScopedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.GetTableDetail),
  schema: z.string(),
  table: z.string()
});

const QueryRequestSchema = TabScopedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.Query),
  sql: z.string().max(50 * 1024)
});

const CancelSchema = z.object({
  type: z.literal(PostgresClientMessageType.Cancel),
  connectionId: z.string().uuid()
});

const OpenConnectionSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.OpenConnection)
});

const CloseConnectionSchema = z.object({
  type: z.literal(PostgresClientMessageType.CloseConnection),
  connectionId: z.string().uuid()
});

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
        nullable: z.boolean(),
        identityGeneration: z.string().nullable()
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
  })
});

const QueryResultResponseSchema = TabScopedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.QueryResult),
  rows: z.array(z.record(z.string(), z.unknown())),
  fields: z.array(z.object({ name: z.string() })),
  rowCount: z.number().nullable(),
  isTruncated: z.boolean(),
  transactionOpen: z.boolean(),
  command: z.string(),
  executionTimeMs: z.number()
});

const ErrorResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.Error),
  connectionId: z.string().uuid().optional(),
  transactionOpen: z.boolean().optional(),
  error: z.string(),
  detail: z.string().optional(),
  hint: z.string().optional()
});

const ConnectionOpenedResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.ConnectionOpened),
  connectionId: z.string().uuid(),
  backendPid: z.number().nullable()
});

const ConnectionOpenFailedResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.ConnectionOpenFailed),
  error: z.string()
});

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
