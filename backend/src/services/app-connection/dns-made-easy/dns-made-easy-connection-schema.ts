import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { DNSMadeEasyConnectionMethod } from "./dns-made-easy-connection-enum";

export const DNSMadeEasyConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API key required").max(256, "API key cannot exceed 256 characters"),
  secretKey: z.string().trim().min(1, "Secret key required").max(256, "Secret key cannot exceed 256 characters")
});

const BaseDNSMadeEasyConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.DNSMadeEasy)
});

export const DNSMadeEasyConnectionSchema = BaseDNSMadeEasyConnectionSchema.extend({
  method: z.literal(DNSMadeEasyConnectionMethod.APIKeySecret),
  credentials: DNSMadeEasyConnectionApiKeyCredentialsSchema
});

export const SanitizedDNSMadeEasyConnectionSchema = z.discriminatedUnion("method", [
  BaseDNSMadeEasyConnectionSchema.extend({
    method: z.literal(DNSMadeEasyConnectionMethod.APIKeySecret),
    credentials: DNSMadeEasyConnectionApiKeyCredentialsSchema.pick({ apiKey: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.DNSMadeEasy]} (API Key)` }))
]);

export const ValidateDNSMadeEasyConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(DNSMadeEasyConnectionMethod.APIKeySecret)
      .describe(AppConnections.CREATE(AppConnection.DNSMadeEasy).method),
    credentials: DNSMadeEasyConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.DNSMadeEasy).credentials
    )
  })
]);

export const CreateDNSMadeEasyConnectionSchema = ValidateDNSMadeEasyConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.DNSMadeEasy)
);

export const UpdateDNSMadeEasyConnectionSchema = z
  .object({
    credentials: DNSMadeEasyConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.DNSMadeEasy).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.DNSMadeEasy));

export const DNSMadeEasyConnectionListItemSchema = z
  .object({
    name: z.literal("DNS Made Easy"),
    app: z.literal(AppConnection.DNSMadeEasy),
    methods: z.nativeEnum(DNSMadeEasyConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.DNSMadeEasy] }));
