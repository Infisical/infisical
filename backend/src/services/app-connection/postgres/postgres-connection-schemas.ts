import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { AppConnection } from "../app-connection-enums";
import { BaseSqlUsernameAndPasswordConnectionSchema } from "../shared/sql";
import { PostgresConnectionMethod } from "./postgres-connection-enums";

export const PostgresConnectionAccessTokenCredentialsSchema = BaseSqlUsernameAndPasswordConnectionSchema;

const BasePostgresConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Postgres) });

export const PostgresConnectionSchema = BasePostgresConnectionSchema.extend({
  method: z.literal(PostgresConnectionMethod.UsernameAndPassword),
  credentials: PostgresConnectionAccessTokenCredentialsSchema
});

export const SanitizedPostgresConnectionSchema = z.discriminatedUnion("method", [
  BasePostgresConnectionSchema.extend({
    method: z.literal(PostgresConnectionMethod.UsernameAndPassword),
    credentials: PostgresConnectionAccessTokenCredentialsSchema.pick({})
  })
]);

export const ValidatePostgresConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(PostgresConnectionMethod.UsernameAndPassword)
      .describe(AppConnections.CREATE(AppConnection.Postgres).method),
    credentials: PostgresConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Postgres).credentials
    )
  })
]);

export const CreatePostgresConnectionSchema = ValidatePostgresConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Postgres)
);

export const UpdatePostgresConnectionSchema = z
  .object({
    credentials: PostgresConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Postgres).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Postgres));

export const PostgresConnectionListItemSchema = z.object({
  name: z.literal("PostgreSQL"),
  app: z.literal(AppConnection.Postgres),
  methods: z.nativeEnum(PostgresConnectionMethod).array()
});
