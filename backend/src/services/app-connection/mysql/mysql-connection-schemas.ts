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
import { MySqlConnectionMethod } from "./mysql-connection-enums";

export const MySqlConnectionAccessTokenCredentialsSchema = BaseSqlUsernameAndPasswordConnectionSchema;

const BaseMySqlConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.MySql) });

export const MySqlConnectionSchema = BaseMySqlConnectionSchema.extend({
  method: z.literal(MySqlConnectionMethod.UsernameAndPassword),
  credentials: MySqlConnectionAccessTokenCredentialsSchema
});

export const SanitizedMySqlConnectionSchema = z.discriminatedUnion("method", [
  BaseMySqlConnectionSchema.extend({
    method: z.literal(MySqlConnectionMethod.UsernameAndPassword),
    credentials: MySqlConnectionAccessTokenCredentialsSchema.pick({
      host: true,
      database: true,
      port: true,
      username: true,
      sslEnabled: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.MySql]} (Username and Password)` }))
]);

export const ValidateMySqlConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(MySqlConnectionMethod.UsernameAndPassword)
      .describe(AppConnections.CREATE(AppConnection.MySql).method),
    credentials: MySqlConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.MySql).credentials
    )
  })
]);

export const CreateMySqlConnectionSchema = ValidateMySqlConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.MySql, {
    supportsPlatformManagedCredentials: true,
    supportsGateways: true
  })
);

export const UpdateMySqlConnectionSchema = z
  .object({
    credentials: MySqlConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.MySql).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.MySql, {
      supportsPlatformManagedCredentials: true,
      supportsGateways: true
    })
  );

export const MySqlConnectionListItemSchema = z
  .object({
    name: z.literal("MySQL"),
    app: z.literal(AppConnection.MySql),
    methods: z.nativeEnum(MySqlConnectionMethod).array(),
    supportsPlatformManagement: z.literal(true)
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.MySql] }));
