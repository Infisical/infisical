import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { HpeIloConnectionMethod } from "./hpe-ilo-connection-enums";

export const HpeIloConnectionBasicAuthCredentialsSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "Hostname is required")
    .max(512, "Hostname cannot exceed 512 characters")
    .refine(
      (val) =>
        !val.includes("/") && !val.includes("@") && !val.includes("?") && !val.includes(":") && !val.includes("#"),
      {
        message: "Hostname must be a hostname or IP address without a scheme, port, or path"
      }
    )
    .describe(AppConnections.CREDENTIALS.HPE_ILO.hostname),
  port: z.number().int().min(1).max(65535).optional().describe(AppConnections.CREDENTIALS.HPE_ILO.port),
  username: z
    .string()
    .trim()
    .min(1, "Username is required")
    .max(256, "Username cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.HPE_ILO.username),
  password: z
    .string()
    .min(1, "Password is required")
    .max(512, "Password cannot exceed 512 characters")
    .describe(AppConnections.CREDENTIALS.HPE_ILO.password),
  sslRejectUnauthorized: z.boolean().optional().describe(AppConnections.CREDENTIALS.HPE_ILO.sslRejectUnauthorized),
  sslCertificate: z
    .string()
    .trim()
    .max(16384, "SSL certificate cannot exceed 16384 characters")
    .transform((value) => value || undefined)
    .optional()
    .describe(AppConnections.CREDENTIALS.HPE_ILO.sslCertificate)
});

const BaseHpeIloConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.HpeIloRedFish) });

export const HpeIloConnectionSchema = BaseHpeIloConnectionSchema.extend({
  method: z.literal(HpeIloConnectionMethod.BasicAuth),
  credentials: HpeIloConnectionBasicAuthCredentialsSchema
});

export const SanitizedHpeIloConnectionSchema = z.discriminatedUnion("method", [
  BaseHpeIloConnectionSchema.extend({
    method: z.literal(HpeIloConnectionMethod.BasicAuth),
    credentials: HpeIloConnectionBasicAuthCredentialsSchema.pick({
      hostname: true,
      port: true,
      username: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.HpeIloRedFish]} (Basic Auth)` }))
]);

export const ValidateHpeIloConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(HpeIloConnectionMethod.BasicAuth)
      .describe(AppConnections.CREATE(AppConnection.HpeIloRedFish).method),
    credentials: HpeIloConnectionBasicAuthCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.HpeIloRedFish).credentials
    )
  })
]);

export const CreateHpeIloConnectionSchema = ValidateHpeIloConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.HpeIloRedFish, {
    supportsGateways: true
  })
);

export const UpdateHpeIloConnectionSchema = z
  .object({
    credentials: HpeIloConnectionBasicAuthCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.HpeIloRedFish).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.HpeIloRedFish, {
      supportsGateways: true
    })
  );

export const HpeIloConnectionListItemSchema = z
  .object({
    name: z.literal("HPE iLO"),
    app: z.literal(AppConnection.HpeIloRedFish),
    methods: z.nativeEnum(HpeIloConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.HpeIloRedFish] }));
