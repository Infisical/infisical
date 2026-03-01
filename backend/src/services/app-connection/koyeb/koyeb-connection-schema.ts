import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { KoyebConnectionMethod } from "./koyeb-connection-enums";

export const KoyebConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API key required").max(256, "API key cannot exceed 256 characters")
});

const BaseKoyebConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Koyeb) });

export const KoyebConnectionSchema = BaseKoyebConnectionSchema.extend({
  method: z.literal(KoyebConnectionMethod.ApiKey),
  credentials: KoyebConnectionApiKeyCredentialsSchema
});

export const SanitizedKoyebConnectionSchema = z.discriminatedUnion("method", [
  BaseKoyebConnectionSchema.extend({
    method: z.literal(KoyebConnectionMethod.ApiKey),
    credentials: KoyebConnectionApiKeyCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Koyeb]} (API Key)` }))
]);

export const ValidateKoyebConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(KoyebConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Koyeb).method),
    credentials: KoyebConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Koyeb).credentials
    )
  })
]);

export const CreateKoyebConnectionSchema = ValidateKoyebConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Koyeb)
);

export const UpdateKoyebConnectionSchema = z
  .object({
    credentials: KoyebConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Koyeb).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Koyeb));

export const KoyebConnectionListItemSchema = z
  .object({
    name: z.literal("Koyeb"),
    app: z.literal(AppConnection.Koyeb),
    methods: z.nativeEnum(KoyebConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Koyeb] }));
