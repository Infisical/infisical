import { z } from "zod";

import { SessionEndReason } from "./pam-web-access-types";

export enum PostgresClientMessageType {
  Input = "input",
  Control = "control",
  GetSchemas = "get-schemas",
  GetTables = "get-tables",
  GetTableDetail = "get-table-detail",
  Query = "query"
}

export enum PostgresServerMessageType {
  Ready = "ready",
  Output = "output",
  SessionEnd = "session_end",
  Schemas = "schemas",
  Tables = "tables",
  TableDetail = "table-detail",
  QueryResult = "query-result",
  Error = "error"
}

// --- Shared base for correlated request/response messages ---

const CorrelatedBaseSchema = z.object({ id: z.string().uuid() });

// =====================================================================
// Client messages (browser → server) — single flat discriminated union
// =====================================================================

const InputSchema = z.object({ type: z.literal(PostgresClientMessageType.Input), data: z.string() });

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
  sql: z.string()
});

export const PostgresClientMessageSchema = z.discriminatedUnion("type", [
  InputSchema,
  ControlSchema,
  GetSchemasRequestSchema,
  GetTablesRequestSchema,
  GetTableDetailRequestSchema,
  QueryRequestSchema
]);

export type TPostgresClientMessage = z.infer<typeof PostgresClientMessageSchema>;

// =====================================================================
// Server messages (server → browser) — single flat discriminated union
// =====================================================================

const OutputSchema = z.object({
  type: z.enum([PostgresServerMessageType.Ready, PostgresServerMessageType.Output]),
  data: z.string(),
  prompt: z.string().default("")
});

const SessionEndSchema = z.object({
  type: z.literal(PostgresServerMessageType.SessionEnd),
  reason: z.nativeEnum(SessionEndReason)
});

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
        // TODO: re-enable when UI needs this
        // typeOid: z.number(),
        nullable: z.boolean(),
        // TODO: re-enable when UI needs this
        // defaultValue: z.string().nullable(),
        // isIdentity: z.boolean(),
        identityGeneration: z.string().nullable()
        // TODO: re-enable when UI needs this
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
    // TODO: re-enable when UI needs these
    // enums: z.record(z.string(), z.array(z.string()))
  })
});

const QueryResultResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.QueryResult),
  rows: z.array(z.record(z.string(), z.unknown())),
  fields: z.array(
    z.object({
      name: z.string()
      // TODO: re-enable when UI needs this
      // dataTypeID: z.number()
    })
  ),
  rowCount: z.number().nullable(),
  command: z.string(),
  executionTimeMs: z.number()
});

const ErrorResponseSchema = CorrelatedBaseSchema.extend({
  type: z.literal(PostgresServerMessageType.Error),
  error: z.string(),
  detail: z.string().optional(),
  hint: z.string().optional()
});

export const PostgresServerMessageSchema = z.discriminatedUnion("type", [
  OutputSchema,
  SessionEndSchema,
  SchemasResponseSchema,
  TablesResponseSchema,
  TableDetailResponseSchema,
  QueryResultResponseSchema,
  ErrorResponseSchema
]);

export type TPostgresServerMessage = z.infer<typeof PostgresServerMessageSchema>;

// Correlated server messages only (excludes lifecycle messages like ready/output/session_end)
export type TPostgresCorrelatedServerMessage = z.infer<
  | typeof SchemasResponseSchema
  | typeof TablesResponseSchema
  | typeof TableDetailResponseSchema
  | typeof QueryResultResponseSchema
  | typeof ErrorResponseSchema
>;
