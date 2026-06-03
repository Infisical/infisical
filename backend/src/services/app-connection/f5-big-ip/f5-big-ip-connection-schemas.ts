import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { F5BigIpConnectionMethod } from "./f5-big-ip-connection-enums";

export const F5BigIpConnectionBasicAuthCredentialsSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "Hostname is required")
    .max(512, "Hostname cannot exceed 512 characters")
    .refine(
      (val) =>
        !val.includes("/") && !val.includes("@") && !val.includes("?") && !val.includes(":") && !val.includes("#"),
      {
        message: "Hostname must not contain /, @, ?, :, or # characters"
      }
    ),
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

const BaseF5BigIpConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.F5BigIp) });

export const F5BigIpConnectionSchema = BaseF5BigIpConnectionSchema.extend({
  method: z.literal(F5BigIpConnectionMethod.BasicAuth),
  credentials: F5BigIpConnectionBasicAuthCredentialsSchema
});

export const SanitizedF5BigIpConnectionSchema = z.discriminatedUnion("method", [
  BaseF5BigIpConnectionSchema.extend({
    method: z.literal(F5BigIpConnectionMethod.BasicAuth),
    credentials: F5BigIpConnectionBasicAuthCredentialsSchema.pick({
      hostname: true,
      port: true,
      username: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.F5BigIp]} (Basic Auth)` }))
]);

export const ValidateF5BigIpConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(F5BigIpConnectionMethod.BasicAuth).describe(AppConnections.CREATE(AppConnection.F5BigIp).method),
    credentials: F5BigIpConnectionBasicAuthCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.F5BigIp).credentials
    )
  })
]);

export const CreateF5BigIpConnectionSchema = ValidateF5BigIpConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.F5BigIp, {
    supportsGateways: true
  })
);

export const UpdateF5BigIpConnectionSchema = z
  .object({
    credentials: F5BigIpConnectionBasicAuthCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.F5BigIp).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.F5BigIp, {
      supportsGateways: true
    })
  );

export const F5BigIpConnectionListItemSchema = z
  .object({
    name: z.literal("F5 BIG-IP"),
    app: z.literal(AppConnection.F5BigIp),
    methods: z.nativeEnum(F5BigIpConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.F5BigIp] }));
