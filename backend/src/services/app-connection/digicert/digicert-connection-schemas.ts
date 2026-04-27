import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { DigiCertConnectionMethod, DigiCertRegion } from "./digicert-connection-enums";

export const DigiCertConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API Key required").describe(AppConnections.CREDENTIALS.DIGICERT.apiKey),
  region: z.nativeEnum(DigiCertRegion).describe(AppConnections.CREDENTIALS.DIGICERT.region)
});

const BaseDigiCertConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.DigiCert)
});

export const DigiCertConnectionSchema = BaseDigiCertConnectionSchema.extend({
  method: z.literal(DigiCertConnectionMethod.ApiKey),
  credentials: DigiCertConnectionApiKeyCredentialsSchema
});

export const SanitizedDigiCertConnectionSchema = z.discriminatedUnion("method", [
  BaseDigiCertConnectionSchema.extend({
    method: z.literal(DigiCertConnectionMethod.ApiKey),
    credentials: DigiCertConnectionApiKeyCredentialsSchema.pick({ region: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.DigiCert]} (API Key)` }))
]);

export const ValidateDigiCertConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(DigiCertConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.DigiCert).method),
    credentials: DigiCertConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.DigiCert).credentials
    )
  })
]);

export const CreateDigiCertConnectionSchema = ValidateDigiCertConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.DigiCert)
);

export const UpdateDigiCertConnectionSchema = z
  .object({
    credentials: DigiCertConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.DigiCert).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.DigiCert));

export const DigiCertConnectionListItemSchema = z
  .object({
    name: z.literal("DigiCert"),
    app: z.literal(AppConnection.DigiCert),
    methods: z.nativeEnum(DigiCertConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.DigiCert] }));
