import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { VenafiConnectionMethod, VenafiRegion } from "./venafi-connection-enums";

export const VenafiConnectionApiKeyCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, "API key required").max(256, "API key cannot exceed 256 characters"),
  region: z.nativeEnum(VenafiRegion).describe("The region of the Venafi TLS Protect Cloud instance")
});

const BaseVenafiConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Venafi) });

export const VenafiConnectionSchema = BaseVenafiConnectionSchema.extend({
  method: z.literal(VenafiConnectionMethod.ApiKey),
  credentials: VenafiConnectionApiKeyCredentialsSchema
});

export const SanitizedVenafiConnectionSchema = z.discriminatedUnion("method", [
  BaseVenafiConnectionSchema.extend({
    method: z.literal(VenafiConnectionMethod.ApiKey),
    credentials: VenafiConnectionApiKeyCredentialsSchema.pick({ region: true })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Venafi]} (API Key)` }))
]);

export const ValidateVenafiConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(VenafiConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.Venafi).method),
    credentials: VenafiConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Venafi).credentials
    )
  })
]);

export const CreateVenafiConnectionSchema = ValidateVenafiConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Venafi)
);

export const UpdateVenafiConnectionSchema = z
  .object({
    credentials: VenafiConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Venafi).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Venafi));

export const VenafiConnectionListItemSchema = z
  .object({
    name: z.literal("Venafi TLS Protect Cloud"),
    app: z.literal(AppConnection.Venafi),
    methods: z.nativeEnum(VenafiConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Venafi] }));
