import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { CloudflareConnectionMethod } from "./cloudflare-connection-enum";

const accountIdCharacterValidator = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Underscore,
  CharacterType.Hyphen
]);

export const CloudflareConnectionApiTokenCredentialsSchema = z.object({
  accountId: z
    .string()
    .trim()
    .min(1, "Account ID required")
    .max(256, "Account ID cannot exceed 256 characters")
    .refine(
      (val) => accountIdCharacterValidator(val),
      "Account ID can only contain alphanumeric characters, underscores, and hyphens"
    ),
  apiToken: z.string().trim().min(1, "API token required").max(256, "API token cannot exceed 256 characters")
});

const BaseCloudflareConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Cloudflare) });

export const CloudflareConnectionSchema = BaseCloudflareConnectionSchema.extend({
  method: z.literal(CloudflareConnectionMethod.APIToken),
  credentials: CloudflareConnectionApiTokenCredentialsSchema
});

export const SanitizedCloudflareConnectionSchema = z.discriminatedUnion("method", [
  BaseCloudflareConnectionSchema.extend({
    method: z.literal(CloudflareConnectionMethod.APIToken),
    credentials: CloudflareConnectionApiTokenCredentialsSchema.pick({ accountId: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Cloudflare]} (API Token)` }))
]);

export const ValidateCloudflareConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(CloudflareConnectionMethod.APIToken)
      .describe(AppConnections.CREATE(AppConnection.Cloudflare).method),
    credentials: CloudflareConnectionApiTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Cloudflare).credentials
    )
  })
]);

export const CreateCloudflareConnectionSchema = ValidateCloudflareConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Cloudflare)
);

export const UpdateCloudflareConnectionSchema = z
  .object({
    credentials: CloudflareConnectionApiTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Cloudflare).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Cloudflare));

export const CloudflareConnectionListItemSchema = z
  .object({
    name: z.literal("Cloudflare"),
    app: z.literal(AppConnection.Cloudflare),
    methods: z.nativeEnum(CloudflareConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Cloudflare] }));
