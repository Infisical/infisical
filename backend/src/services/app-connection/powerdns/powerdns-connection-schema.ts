import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { PowerDNSConnectionMethod } from "./powerdns-connection-enum";

export const PowerDNSConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API key required").max(256, "API key cannot exceed 256 characters"),
  baseUrl: z
    .string()
    .trim()
    .url("Base URL must be a valid URL")
    .min(1, "Base URL required")
    .max(1024, "Base URL cannot exceed 1024 characters")
});

const BasePowerDNSConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.PowerDNS)
});

export const PowerDNSConnectionSchema = BasePowerDNSConnectionSchema.extend({
  method: z.literal(PowerDNSConnectionMethod.APIKey),
  credentials: PowerDNSConnectionApiKeyCredentialsSchema
});

export const SanitizedPowerDNSConnectionSchema = z.discriminatedUnion("method", [
  BasePowerDNSConnectionSchema.extend({
    method: z.literal(PowerDNSConnectionMethod.APIKey),
    credentials: PowerDNSConnectionApiKeyCredentialsSchema.pick({ baseUrl: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.PowerDNS]} (API Key)` }))
]);

export const ValidatePowerDNSConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(PowerDNSConnectionMethod.APIKey)
      .describe(AppConnections.CREATE(AppConnection.PowerDNS).method),
    credentials: PowerDNSConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.PowerDNS).credentials
    )
  })
]);

export const CreatePowerDNSConnectionSchema = ValidatePowerDNSConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.PowerDNS)
);

export const UpdatePowerDNSConnectionSchema = z
  .object({
    credentials: PowerDNSConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.PowerDNS).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.PowerDNS));

export const PowerDNSConnectionListItemSchema = z
  .object({
    name: z.literal("PowerDNS"),
    app: z.literal(AppConnection.PowerDNS),
    methods: z.nativeEnum(PowerDNSConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.PowerDNS] }));
