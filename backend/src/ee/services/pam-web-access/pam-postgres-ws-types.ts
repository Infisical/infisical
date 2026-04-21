import { z } from "zod";

export enum PostgresClientMessageType {
  Control = "control",
  GetSchemas = "get-schemas",
  GetTables = "get-tables",
  GetTableDetail = "get-table-detail",
  Query = "query",
  Cancel = "cancel"
}

export enum PostgresServerMessageType {
  Schemas = "schemas",
  Tables = "tables",
  TableDetail = "table-detail",
  QueryResult = "query-result",
  Error = "error"
}

// --- Shared base for correlated request/response messages ---

const CorrelatedBaseSchema = z.object({ id: z.string().uuid() });

// =====================================================================
// Client messages (client → server) — single flat discriminated union
// =====================================================================

const ControlSchema = z.object({ type: z.literal(PostgresClientMessageType.Control), data: z.string() });

const GetSchemasRequestSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.GetSchemas)
});

const GetTablesRequestSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.GetTables),
  schema: z.string()
});

const GetTableDetailRequestSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.GetTableDetail),
  schema: z.string(),
  table: z.string()
});

const QueryRequestSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresClientMessageType.Query),
  sql: z.string().max(50 * 1024)
});

const CancelSchema = z.object({ type: z.literal(PostgresClientMessageType.Cancel) });

export const PostgresClientMessageSchema = z.discriminatedUnion("type", [
  ControlSchema,
  GetSchemasRequestSchema,
  GetTablesRequestSchema,
  GetTableDetailRequestSchema,
  QueryRequestSchema,
  CancelSchema
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

const TableDetailResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.TableDetail),
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

const QueryResultResponseSchema = CorrelatedBaseSchema.extend({
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

const ErrorResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.Error),
  error: z.string(),
  detail: z.string().optional(),
  hint: z.string().optional()
});

export type TPostgresCorrelatedServerMessage = z.infer<
  | typeof SchemasResponseSchema
  | typeof TablesResponseSchema
  | typeof TableDetailResponseSchema
  | typeof QueryResultResponseSchema
  | typeof ErrorResponseSchema
>;
