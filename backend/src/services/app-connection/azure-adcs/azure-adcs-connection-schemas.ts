import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { AzureADCSConnectionMethod } from "./azure-adcs-connection-enums";

export const AzureADCSUsernamePasswordCredentialsSchema = z.object({
  adcsUrl: z
    .string()
    .trim()
    .min(1, "ADCS URL required")
    .max(255)
    .refine((value) => value.startsWith("https://"), "ADCS URL must use HTTPS")
    .describe(AppConnections.CREDENTIALS.AZURE_ADCS.adcsUrl),
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.AZURE_ADCS.username),
  password: z
    .string()
    .trim()
    .min(1, "Password required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.AZURE_ADCS.password),
  sslRejectUnauthorized: z.boolean().optional().describe(AppConnections.CREDENTIALS.AZURE_ADCS.sslRejectUnauthorized),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
    .describe(AppConnections.CREDENTIALS.AZURE_ADCS.sslCertificate)
});

const BaseAzureADCSConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.AzureADCS) });

export const AzureADCSConnectionSchema = BaseAzureADCSConnectionSchema.extend({
  method: z.literal(AzureADCSConnectionMethod.UsernamePassword),
  credentials: AzureADCSUsernamePasswordCredentialsSchema
});

export const SanitizedAzureADCSConnectionSchema = z.discriminatedUnion("method", [
  BaseAzureADCSConnectionSchema.extend({
    method: z.literal(AzureADCSConnectionMethod.UsernamePassword),
    credentials: AzureADCSUsernamePasswordCredentialsSchema.pick({
      username: true,
      adcsUrl: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.AzureADCS]} (Username and Password)` }))
]);

export const ValidateAzureADCSConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(AzureADCSConnectionMethod.UsernamePassword)
      .describe(AppConnections.CREATE(AppConnection.AzureADCS).method),
    credentials: AzureADCSUsernamePasswordCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.AzureADCS).credentials
    )
  })
]);

export const CreateAzureADCSConnectionSchema = ValidateAzureADCSConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.AzureADCS)
);

export const UpdateAzureADCSConnectionSchema = z
  .object({
    credentials: AzureADCSUsernamePasswordCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.AzureADCS).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.AzureADCS));

export const AzureADCSConnectionListItemSchema = z
  .object({
    name: z.literal("Azure ADCS"),
    app: z.literal(AppConnection.AzureADCS),
    methods: z.nativeEnum(AzureADCSConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.AzureADCS] }));
