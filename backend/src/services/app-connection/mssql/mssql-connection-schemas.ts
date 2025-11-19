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
import { MsSqlConnectionMethod } from "./mssql-connection-enums";

export const MsSqlConnectionAccessTokenCredentialsSchema = BaseSqlUsernameAndPasswordConnectionSchema;

const BaseMsSqlConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.MsSql)
});

export const MsSqlConnectionSchema = BaseMsSqlConnectionSchema.extend({
  method: z.literal(MsSqlConnectionMethod.UsernameAndPassword),
  credentials: MsSqlConnectionAccessTokenCredentialsSchema
});

export const SanitizedMsSqlConnectionSchema = z.discriminatedUnion("method", [
  BaseMsSqlConnectionSchema.extend({
    method: z.literal(MsSqlConnectionMethod.UsernameAndPassword),
    credentials: MsSqlConnectionAccessTokenCredentialsSchema.pick({
      host: true,
      database: true,
      port: true,
      username: true,
      sslEnabled: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.MsSql]} (Username and Password)` }))
]);

export const ValidateMsSqlConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(MsSqlConnectionMethod.UsernameAndPassword)
      .describe(AppConnections.CREATE(AppConnection.MsSql).method),
    credentials: MsSqlConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.MsSql).credentials
    )
  })
]);

export const CreateMsSqlConnectionSchema = ValidateMsSqlConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.MsSql, {
    supportsPlatformManagedCredentials: true,
    supportsGateways: true
  })
);

export const UpdateMsSqlConnectionSchema = z
  .object({
    credentials: MsSqlConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.MsSql).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.MsSql, {
      supportsPlatformManagedCredentials: true,
      supportsGateways: true
    })
  );

export const MsSqlConnectionListItemSchema = z
  .object({
    name: z.literal("Microsoft SQL Server"),
    app: z.literal(AppConnection.MsSql),
    methods: z.nativeEnum(MsSqlConnectionMethod).array(),
    supportsPlatformManagement: z.literal(true)
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.MsSql] }));
