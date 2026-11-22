import { isIPv6 } from "node:net";

import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { AppConnection } from "../app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ClickHouseConnectionMethod } from "./clickhouse-connection-enums";

export const ClickHouseConnectionUsernameAndPasswordCredentialsSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1, "Host required")
    .max(255, "Host cannot exceed 255 characters")
    // the client reads URL query parameters as its config, so the host must not carry a scheme, path, or query
    .refine(
      (host) => /^[a-zA-Z0-9._-]+$/.test(host) || isIPv6(host),
      "Host must be a hostname or IP address without a scheme, port, or path, such as clickhouse.example.com"
    )
    .describe(AppConnections.CREDENTIALS.SQL_CONNECTION.host),
  port: z.coerce.number().int().min(1).max(65535).describe(AppConnections.CREDENTIALS.SQL_CONNECTION.port),
  database: z
    .string()
    .trim()
    .min(1, "Database required")
    .max(255, "Database cannot exceed 255 characters")
    .describe(AppConnections.CREDENTIALS.SQL_CONNECTION.database),
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(256, "Username cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.SQL_CONNECTION.username),
  password: z
    .string()
    .trim()
    .min(1, "Password required")
    .max(512, "Password cannot exceed 512 characters")
    .describe(AppConnections.CREDENTIALS.SQL_CONNECTION.password),
  sslEnabled: z.boolean().describe(AppConnections.CREDENTIALS.SQL_CONNECTION.sslEnabled),
  sslRejectUnauthorized: z.boolean().describe(AppConnections.CREDENTIALS.SQL_CONNECTION.sslRejectUnauthorized),
  sslCertificate: z
    .string()
    .trim()
    .max(10240, "SSL certificate cannot exceed 10240 characters")
    .transform((value) => value || undefined)
    .optional()
    .describe(AppConnections.CREDENTIALS.SQL_CONNECTION.sslCertificate)
});

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
    supportsGateways: true
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
      supportsGateways: true
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
