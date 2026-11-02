import RE2 from "re2";
import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ImpervaConnectionMethod } from "./imperva-connection-enums";

const ACCOUNT_ID_PATTERN = new RE2("^[0-9]+$");
// Both credentials go straight into request headers, where a stray newline throws deep in Node
// rather than failing here with the field named.
const HEADER_SAFE_PATTERN = new RE2("^[\\x21-\\x7e]+$");

export const ImpervaConnectionApiKeyCredentialsSchema = z.object({
  apiId: z
    .string()
    .trim()
    .min(1, "API ID is required")
    .max(256, "API ID cannot exceed 256 characters")
    .refine((val) => HEADER_SAFE_PATTERN.test(val), { message: "API ID cannot contain spaces or line breaks" })
    .describe(AppConnections.CREDENTIALS.IMPERVA.apiId),
  apiKey: z
    .string()
    .trim()
    .min(1, "API key is required")
    .max(512, "API key cannot exceed 512 characters")
    .refine((val) => HEADER_SAFE_PATTERN.test(val), { message: "API key cannot contain spaces or line breaks" })
    .describe(AppConnections.CREDENTIALS.IMPERVA.apiKey),
  accountId: z
    .string()
    .trim()
    .min(1, "Account ID cannot be empty")
    .max(32, "Account ID cannot exceed 32 characters")
    .refine((val) => ACCOUNT_ID_PATTERN.test(val), { message: "Account ID must be numeric" })
    .optional()
    .describe(AppConnections.CREDENTIALS.IMPERVA.accountId)
});

const BaseImpervaConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Imperva)
});

export const ImpervaConnectionSchema = BaseImpervaConnectionSchema.extend({
  method: z.literal(ImpervaConnectionMethod.ApiKey),
  credentials: ImpervaConnectionApiKeyCredentialsSchema
});

export const SanitizedImpervaConnectionSchema = z.discriminatedUnion("method", [
  BaseImpervaConnectionSchema.extend({
    method: z.literal(ImpervaConnectionMethod.ApiKey),
    credentials: ImpervaConnectionApiKeyCredentialsSchema.pick({
      apiId: true,
      accountId: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Imperva]} (API Key)` }))
]);

export const ValidateImpervaConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(ImpervaConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Imperva).method),
    credentials: ImpervaConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Imperva).credentials
    )
  })
]);

export const CreateImpervaConnectionSchema = ValidateImpervaConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Imperva, {
    supportsGateways: true
  })
);

export const UpdateImpervaConnectionSchema = z
  .object({
    credentials: ImpervaConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Imperva).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.Imperva, {
      supportsGateways: true
    })
  );

export const ImpervaConnectionListItemSchema = z
  .object({
    name: z.literal("Imperva"),
    app: z.literal(AppConnection.Imperva),
    methods: z.nativeEnum(ImpervaConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Imperva] }));
