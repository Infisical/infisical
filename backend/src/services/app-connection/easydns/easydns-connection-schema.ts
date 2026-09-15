import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { EasyDNSConnectionMethod } from "./easydns-connection-enum";

export const EasyDNSConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API token required").max(256, "API token cannot exceed 256 characters"),
  secretKey: z.string().trim().min(1, "API key required").max(256, "API key cannot exceed 256 characters")
});

const BaseEasyDNSConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.EasyDNS)
});

export const EasyDNSConnectionSchema = BaseEasyDNSConnectionSchema.extend({
  method: z.literal(EasyDNSConnectionMethod.APIKeySecret),
  credentials: EasyDNSConnectionApiKeyCredentialsSchema
});

export const SanitizedEasyDNSConnectionSchema = z.discriminatedUnion("method", [
  BaseEasyDNSConnectionSchema.extend({
    method: z.literal(EasyDNSConnectionMethod.APIKeySecret),
    credentials: EasyDNSConnectionApiKeyCredentialsSchema.pick({ apiKey: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.EasyDNS]} (API Key)` }))
]);

export const ValidateEasyDNSConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(EasyDNSConnectionMethod.APIKeySecret).describe(AppConnections.CREATE(AppConnection.EasyDNS).method),
    credentials: EasyDNSConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.EasyDNS).credentials
    )
  })
]);

export const CreateEasyDNSConnectionSchema = ValidateEasyDNSConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.EasyDNS)
);

export const UpdateEasyDNSConnectionSchema = z
  .object({
    credentials: EasyDNSConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.EasyDNS).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.EasyDNS));

export const EasyDNSConnectionListItemSchema = z
  .object({
    name: z.literal("EasyDNS"),
    app: z.literal(AppConnection.EasyDNS),
    methods: z.nativeEnum(EasyDNSConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.EasyDNS] }));
