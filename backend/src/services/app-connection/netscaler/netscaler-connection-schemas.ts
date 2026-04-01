import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { NetScalerConnectionMethod } from "./netscaler-connection-enums";

export const NetScalerConnectionBasicAuthCredentialsSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "Hostname is required")
    .max(512, "Hostname cannot exceed 512 characters")
    .refine((val) => !val.includes("/") && !val.includes("@") && !val.includes("?"), {
      message: "Hostname must not contain /, @, or ? characters"
    }),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().trim().min(1, "Username is required").max(256, "Username cannot exceed 256 characters"),
  password: z.string().trim().min(1, "Password is required").max(512, "Password cannot exceed 512 characters"),
  sslRejectUnauthorized: z.boolean().optional(),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});

const BaseNetScalerConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.NetScaler) });

export const NetScalerConnectionSchema = BaseNetScalerConnectionSchema.extend({
  method: z.literal(NetScalerConnectionMethod.BasicAuth),
  credentials: NetScalerConnectionBasicAuthCredentialsSchema
});

export const SanitizedNetScalerConnectionSchema = z.discriminatedUnion("method", [
  BaseNetScalerConnectionSchema.extend({
    method: z.literal(NetScalerConnectionMethod.BasicAuth),
    credentials: NetScalerConnectionBasicAuthCredentialsSchema.pick({
      hostname: true,
      port: true,
      username: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.NetScaler]} (Basic Auth)` }))
]);

export const ValidateNetScalerConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z
      .literal(NetScalerConnectionMethod.BasicAuth)
      .describe(AppConnections.CREATE(AppConnection.NetScaler).method),
    credentials: NetScalerConnectionBasicAuthCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.NetScaler).credentials
    )
  })
]);

export const CreateNetScalerConnectionSchema = ValidateNetScalerConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.NetScaler, {
    supportsGateways: true
  })
);

export const UpdateNetScalerConnectionSchema = z
  .object({
    credentials: NetScalerConnectionBasicAuthCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.NetScaler).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.NetScaler, {
      supportsGateways: true
    })
  );

export const NetScalerConnectionListItemSchema = z
  .object({
    name: z.literal("NetScaler"),
    app: z.literal(AppConnection.NetScaler),
    methods: z.nativeEnum(NetScalerConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.NetScaler] }));
