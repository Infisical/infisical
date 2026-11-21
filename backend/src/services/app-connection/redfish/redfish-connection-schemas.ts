import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { isValidIp } from "@app/lib/ip";
import { isValidHostname } from "@app/lib/validator/validate-hostname";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { RedfishConnectionMethod } from "./redfish-connection-enums";

export const RedfishConnectionBasicAuthCredentialsSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(1, "Hostname is required")
    .max(512, "Hostname cannot exceed 512 characters")
    // IPv6 zone IDs (fe80::1%eth0) are rejected because they cannot be placed in the request URL
    .refine((val) => isValidHostname(val) || (isValidIp(val) && !val.includes("%")), {
      message: "Hostname must be a hostname or IP address without a scheme, port, brackets, or path"
    })
    .describe(AppConnections.CREDENTIALS.REDFISH.hostname),
  port: z.number().int().min(1).max(65535).optional().describe(AppConnections.CREDENTIALS.REDFISH.port),
  username: z
    .string()
    .trim()
    .min(1, "Username is required")
    .max(256, "Username cannot exceed 256 characters")
    .describe(AppConnections.CREDENTIALS.REDFISH.username),
  password: z
    .string()
    .min(1, "Password is required")
    .max(512, "Password cannot exceed 512 characters")
    .describe(AppConnections.CREDENTIALS.REDFISH.password),
  sslRejectUnauthorized: z.boolean().optional().describe(AppConnections.CREDENTIALS.REDFISH.sslRejectUnauthorized),
  sslCertificate: z
    .string()
    .trim()
    .max(16384, "SSL certificate cannot exceed 16384 characters")
    .transform((value) => value || undefined)
    .optional()
    .describe(AppConnections.CREDENTIALS.REDFISH.sslCertificate)
});

const BaseRedfishConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.Redfish) });

export const RedfishConnectionSchema = BaseRedfishConnectionSchema.extend({
  method: z.literal(RedfishConnectionMethod.BasicAuth),
  credentials: RedfishConnectionBasicAuthCredentialsSchema
});

export const SanitizedRedfishConnectionSchema = z.discriminatedUnion("method", [
  BaseRedfishConnectionSchema.extend({
    method: z.literal(RedfishConnectionMethod.BasicAuth),
    credentials: RedfishConnectionBasicAuthCredentialsSchema.pick({
      hostname: true,
      port: true,
      username: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Redfish]} (Basic Auth)` }))
]);

export const ValidateRedfishConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(RedfishConnectionMethod.BasicAuth).describe(AppConnections.CREATE(AppConnection.Redfish).method),
    credentials: RedfishConnectionBasicAuthCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Redfish).credentials
    )
  })
]);

export const CreateRedfishConnectionSchema = ValidateRedfishConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Redfish, {
    supportsGateways: true
  })
);

export const UpdateRedfishConnectionSchema = z
  .object({
    credentials: RedfishConnectionBasicAuthCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Redfish).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.Redfish, {
      supportsGateways: true
    })
  );

export const RedfishConnectionListItemSchema = z
  .object({
    name: z.literal("Redfish"),
    app: z.literal(AppConnection.Redfish),
    methods: z.nativeEnum(RedfishConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Redfish] }));
