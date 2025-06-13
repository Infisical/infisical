import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";
import { BaseSqlUsernameAndPasswordConnectionSchema } from "@app/services/app-connection/shared/sql";

import { OracleDBConnectionMethod } from "./oracledb-connection-enums";

export const OracleDBConnectionCredentialsSchema = BaseSqlUsernameAndPasswordConnectionSchema;

const BaseOracleDBConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.OracleDB) });

export const OracleDBConnectionSchema = BaseOracleDBConnectionSchema.extend({
  method: z.literal(OracleDBConnectionMethod.UsernameAndPassword),
  credentials: OracleDBConnectionCredentialsSchema
});

export const SanitizedOracleDBConnectionSchema = z.discriminatedUnion("method", [
  BaseOracleDBConnectionSchema.extend({
    method: z.literal(OracleDBConnectionMethod.UsernameAndPassword),
    credentials: OracleDBConnectionCredentialsSchema.pick({
      host: true,
      database: true,
      port: true,
      username: true,
      sslEnabled: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  })
]);

export const ValidateOracleDBConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(OracleDBConnectionMethod.UsernameAndPassword)
      .describe(AppConnections.CREATE(AppConnection.OracleDB).method),
    credentials: OracleDBConnectionCredentialsSchema.describe(AppConnections.CREATE(AppConnection.OracleDB).credentials)
  })
]);

export const CreateOracleDBConnectionSchema = ValidateOracleDBConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.OracleDB, { supportsPlatformManagedCredentials: true })
);

export const UpdateOracleDBConnectionSchema = z
  .object({
    credentials: OracleDBConnectionCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.OracleDB).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.OracleDB, { supportsPlatformManagedCredentials: true }));

export const OracleDBConnectionListItemSchema = z.object({
  name: z.literal("OracleDB"),
  app: z.literal(AppConnection.OracleDB),
  methods: z.nativeEnum(OracleDBConnectionMethod).array(),
  supportsPlatformManagement: z.literal(true)
});
