import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { AppConnection } from "../app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
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
    credentials: PostgresConnectionAccessTokenCredentialsSchema.pick({
      host: true,
      database: true,
      port: true,
      username: true,
      sslEnabled: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Postgres]} (Username and Password)` }))
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
  GenericCreateAppConnectionFieldsSchema(AppConnection.Postgres, {
    supportsPlatformManagedCredentials: true,
    supportsGateways: true
  })
);

export const UpdatePostgresConnectionSchema = z
  .object({
    credentials: PostgresConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Postgres).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.Postgres, {
      supportsPlatformManagedCredentials: true,
      supportsGateways: true
    })
  );

export const PostgresConnectionListItemSchema = z
  .object({
    name: z.literal("PostgreSQL"),
    app: z.literal(AppConnection.Postgres),
    methods: z.nativeEnum(PostgresConnectionMethod).array(),
    supportsPlatformManagement: z.literal(true)
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Postgres] }));
