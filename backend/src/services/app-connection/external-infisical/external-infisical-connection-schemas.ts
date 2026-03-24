import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { ExternalInfisicalConnectionMethod } from "./external-infisical-connection-enums";

export const ExternalInfisicalConnectionMachineIdentityCredentialsSchema = z.object({
  instanceUrl: z
    .string()
    .trim()
    .url("Instance URL must be a valid URL")
    .min(1, "Instance URL is required")
    .max(512, "Instance URL cannot exceed 512 characters"),
  machineIdentityClientId: z
    .string()
    .trim()
    .uuid("Machine Identity Client ID must be a valid UUID")
    .min(1, "Machine Identity Client ID is required"),
  machineIdentityClientSecret: z
    .string()
    .trim()
    .min(1, "Machine Identity Client Secret is required")
    .max(512, "Machine Identity Client Secret cannot exceed 512 characters")
});

const BaseExternalInfisicalConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.ExternalInfisical)
});

export const ExternalInfisicalConnectionSchema = BaseExternalInfisicalConnectionSchema.extend({
  method: z.literal(ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth),
  credentials: ExternalInfisicalConnectionMachineIdentityCredentialsSchema
});

export const SanitizedExternalInfisicalConnectionSchema = z.discriminatedUnion("method", [
  BaseExternalInfisicalConnectionSchema.extend({
    method: z.literal(ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth),
    credentials: ExternalInfisicalConnectionMachineIdentityCredentialsSchema.pick({
      instanceUrl: true,
      machineIdentityClientId: true
    })
  }).describe(
    JSON.stringify({
      title: `${APP_CONNECTION_NAME_MAP[AppConnection.ExternalInfisical]} (Machine Identity - Universal Auth)`
    })
  )
]);

export const ValidateExternalInfisicalConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth)
      .describe(AppConnections.CREATE(AppConnection.ExternalInfisical).method),
    credentials: ExternalInfisicalConnectionMachineIdentityCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.ExternalInfisical).credentials
    )
  })
]);

export const CreateExternalInfisicalConnectionSchema = ValidateExternalInfisicalConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.ExternalInfisical)
);

export const UpdateExternalInfisicalConnectionSchema = z
  .object({
    credentials: ExternalInfisicalConnectionMachineIdentityCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.ExternalInfisical).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.ExternalInfisical));

export const ExternalInfisicalConnectionListItemSchema = z
  .object({
    name: z.literal("Infisical"),
    app: z.literal(AppConnection.ExternalInfisical),
    methods: z.nativeEnum(ExternalInfisicalConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.ExternalInfisical] }));
