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
import { ClickHouseConnectionMethod } from "./clickhouse-connection-enums";

export const ClickHouseConnectionUsernameAndPasswordCredentialsSchema = BaseSqlUsernameAndPasswordConnectionSchema;

const BaseClickHouseConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.ClickHouse) });

export const ClickHouseConnectionSchema = BaseClickHouseConnectionSchema.extend({
  method: z.literal(ClickHouseConnectionMethod.UsernameAndPassword),
  credentials: ClickHouseConnectionUsernameAndPasswordCredentialsSchema
});

export const SanitizedClickHouseConnectionSchema = z.discriminatedUnion("method", [
  BaseClickHouseConnectionSchema.extend({
    method: z.literal(ClickHouseConnectionMethod.UsernameAndPassword),
    credentials: ClickHouseConnectionUsernameAndPasswordCredentialsSchema.pick({
      host: true,
      database: true,
      port: true,
      username: true,
      sslEnabled: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.ClickHouse]} (Username and Password)` }))
]);

export const ValidateClickHouseConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(ClickHouseConnectionMethod.UsernameAndPassword)
      .describe(AppConnections.CREATE(AppConnection.ClickHouse).method),
    credentials: ClickHouseConnectionUsernameAndPasswordCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.ClickHouse).credentials
    )
  })
]);

export const CreateClickHouseConnectionSchema = ValidateClickHouseConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.ClickHouse, {
    supportsPlatformManagedCredentials: false,
    supportsGateways: false
  })
);

export const UpdateClickHouseConnectionSchema = z
  .object({
    credentials: ClickHouseConnectionUsernameAndPasswordCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.ClickHouse).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.ClickHouse, {
      supportsPlatformManagedCredentials: false,
      supportsGateways: false
    })
  );

export const ClickHouseConnectionListItemSchema = z
  .object({
    name: z.literal("ClickHouse"),
    app: z.literal(AppConnection.ClickHouse),
    methods: z.nativeEnum(ClickHouseConnectionMethod).array(),
    supportsPlatformManagement: z.literal(false)
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.ClickHouse] }));
