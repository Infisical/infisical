import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { DigitalOceanConnectionMethod } from "./digital-ocean-connection-constants";

export const DigitalOceanConnectionMethodSchema = z
  .nativeEnum(DigitalOceanConnectionMethod)
  .describe(AppConnections.CREATE(AppConnection.DigitalOcean).method);

export const DigitalOceanConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z
    .string()
    .trim()
    .min(1, "API Token required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.DIGITAL_OCEAN_APP_PLATFORM.apiToken)
});

const BaseDigitalOceanConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.DigitalOcean)
});

export const DigitalOceanConnectionSchema = BaseDigitalOceanConnectionSchema.extend({
  method: DigitalOceanConnectionMethodSchema,
  credentials: DigitalOceanConnectionAccessTokenCredentialsSchema
});

export const SanitizedDigitalOceanConnectionSchema = z.discriminatedUnion("method", [
  BaseDigitalOceanConnectionSchema.extend({
    method: DigitalOceanConnectionMethodSchema,
    credentials: DigitalOceanConnectionAccessTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.DigitalOcean]} (Access Token)` }))
]);

export const ValidateDigitalOceanConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: DigitalOceanConnectionMethodSchema,
    credentials: DigitalOceanConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.DigitalOcean).credentials
    )
  })
]);

export const CreateDigitalOceanConnectionSchema = ValidateDigitalOceanConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.DigitalOcean)
);

export const UpdateDigitalOceanConnectionSchema = z
  .object({
    credentials: DigitalOceanConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.DigitalOcean).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.DigitalOcean));

export const DigitalOceanConnectionListItemSchema = z
  .object({
    name: z.literal("Digital Ocean"),
    app: z.literal(AppConnection.DigitalOcean),
    methods: z.nativeEnum(DigitalOceanConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.DigitalOcean] }));
