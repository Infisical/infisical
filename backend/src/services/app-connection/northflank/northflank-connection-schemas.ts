import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { NorthflankConnectionMethod } from "./northflank-connection-enums";

export const NorthflankConnectionApiTokenCredentialsSchema = z.object({
  apiToken: z.string().trim().min(1, "API Token required").describe(AppConnections.CREDENTIALS.NORTHFLANK.apiToken)
});

const BaseNorthflankConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Northflank)
});

export const NorthflankConnectionSchema = BaseNorthflankConnectionSchema.extend({
  method: z.literal(NorthflankConnectionMethod.ApiToken),
  credentials: NorthflankConnectionApiTokenCredentialsSchema
});

export const SanitizedNorthflankConnectionSchema = z.discriminatedUnion("method", [
  BaseNorthflankConnectionSchema.extend({
    method: z.literal(NorthflankConnectionMethod.ApiToken),
    credentials: NorthflankConnectionApiTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Northflank]} (API Token)` }))
]);

export const ValidateNorthflankConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(NorthflankConnectionMethod.ApiToken)
      .describe(AppConnections.CREATE(AppConnection.Northflank).method),
    credentials: NorthflankConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Northflank).credentials
    )
  })
]);

export const CreateNorthflankConnectionSchema = ValidateNorthflankConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Northflank)
);

export const UpdateNorthflankConnectionSchema = z
  .object({
    credentials: NorthflankConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Northflank).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Northflank));

export const NorthflankConnectionListItemSchema = z
  .object({
    name: z.literal("Northflank"),
    app: z.literal(AppConnection.Northflank),
    methods: z.nativeEnum(NorthflankConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Northflank] }));
