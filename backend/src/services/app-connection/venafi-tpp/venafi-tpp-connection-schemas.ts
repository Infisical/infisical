import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { VenafiTppConnectionMethod } from "./venafi-tpp-connection-enums";

export const VenafiTppUsernamePasswordCredentialsSchema = z.object({
  tppUrl: z
    .string()
    .trim()
    .min(1, "TPP URL required")
    .max(512)
    .refine((value) => value.startsWith("https://"), "TPP URL must use HTTPS")
    .describe(AppConnections.CREDENTIALS.VENAFI_TPP.tppUrl),
  clientId: z
    .string()
    .trim()
    .min(1, "Client ID required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.VENAFI_TPP.clientId),
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.VENAFI_TPP.username),
  password: z
    .string()
    .trim()
    .min(1, "Password required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.VENAFI_TPP.password)
});

const BaseVenafiTppConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.VenafiTpp) });

export const VenafiTppConnectionSchema = BaseVenafiTppConnectionSchema.extend({
  method: z.literal(VenafiTppConnectionMethod.UsernamePassword),
  credentials: VenafiTppUsernamePasswordCredentialsSchema
});

export const SanitizedVenafiTppConnectionSchema = z.discriminatedUnion("method", [
  BaseVenafiTppConnectionSchema.extend({
    method: z.literal(VenafiTppConnectionMethod.UsernamePassword),
    credentials: VenafiTppUsernamePasswordCredentialsSchema.pick({
      tppUrl: true,
      clientId: true,
      username: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.VenafiTpp]} (Username and Password)` }))
]);

export const ValidateVenafiTppConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(VenafiTppConnectionMethod.UsernamePassword)
      .describe(AppConnections.CREATE(AppConnection.VenafiTpp).method),
    credentials: VenafiTppUsernamePasswordCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.VenafiTpp).credentials
    )
  })
]);

export const CreateVenafiTppConnectionSchema = ValidateVenafiTppConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.VenafiTpp, { supportsGateways: true })
);

export const UpdateVenafiTppConnectionSchema = z
  .object({
    credentials: VenafiTppUsernamePasswordCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.VenafiTpp).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.VenafiTpp, { supportsGateways: true }));

export const VenafiTppConnectionListItemSchema = z
  .object({
    name: z.literal("Venafi TPP"),
    app: z.literal(AppConnection.VenafiTpp),
    methods: z.nativeEnum(VenafiTppConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.VenafiTpp] }));
