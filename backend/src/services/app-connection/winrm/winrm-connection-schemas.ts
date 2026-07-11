import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { WinRMConnectionMethod } from "./winrm-connection-enums";

export const WinRMUsernamePasswordCredentialsSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1, "Host required")
    .max(255)
    .describe("The Windows host's DNS name (FQDN) or IP address."),
  port: z.coerce.number().int().min(1).max(65535).default(5986).describe("The WinRM HTTPS port (typically 5986)."),
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(255)
    .describe("Windows login: DOMAIN\\user or user@domain."),
  password: z.string().min(1, "Password required").max(255).describe("The account password."),
  caCertificate: z
    .string()
    .trim()
    .max(8192)
    .optional()
    .describe(
      "PEM CA certificate used to verify a self-signed WinRM HTTPS listener. When set, TLS verification is enforced against it and 'insecure' is ignored."
    ),
  insecure: z
    .boolean()
    .default(false)
    .describe(
      "Skip TLS certificate verification. Gives confidentiality but not server authentication; prefer pinning a CA certificate for self-signed listeners."
    )
});

const BaseWinRMConnectionSchema = BaseAppConnectionSchema.extend({ app: z.literal(AppConnection.WinRM) });

export const WinRMConnectionSchema = BaseWinRMConnectionSchema.extend({
  method: z.literal(WinRMConnectionMethod.UsernamePassword),
  credentials: WinRMUsernamePasswordCredentialsSchema
});

export const SanitizedWinRMConnectionSchema = z.discriminatedUnion("method", [
  BaseWinRMConnectionSchema.extend({
    method: z.literal(WinRMConnectionMethod.UsernamePassword),
    // Never return the password.
    credentials: WinRMUsernamePasswordCredentialsSchema.pick({
      host: true,
      port: true,
      username: true,
      caCertificate: true,
      insecure: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.WinRM]} (Username and Password)` }))
]);

export const ValidateWinRMConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(WinRMConnectionMethod.UsernamePassword),
    credentials: WinRMUsernamePasswordCredentialsSchema
  })
]);

export const CreateWinRMConnectionSchema = ValidateWinRMConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.WinRM, { supportsGateways: true })
);

export const UpdateWinRMConnectionSchema = z
  .object({
    credentials: WinRMUsernamePasswordCredentialsSchema.optional()
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.WinRM, { supportsGateways: true }));

export const WinRMConnectionListItemSchema = z
  .object({
    name: z.literal("Windows (WinRM)"),
    app: z.literal(AppConnection.WinRM),
    methods: z.nativeEnum(WinRMConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.WinRM] }));
