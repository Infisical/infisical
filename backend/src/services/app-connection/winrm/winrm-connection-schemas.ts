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
  port: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(5985)
    .describe("The WinRM port. 5985 for HTTP with NTLM message encryption, 5986 for HTTPS."),
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(255)
    .describe("Windows login: DOMAIN\\user or user@domain."),
  password: z.string().min(1, "Password required").max(255).describe("The account password."),
  sslEnabled: z
    .boolean()
    .default(false)
    .describe("Connect over HTTPS. When disabled, HTTP with NTLM message encryption is used."),
  sslRejectUnauthorized: z.boolean().default(true).describe("Verify the listener's TLS certificate (HTTPS only)."),
  sslCertificate: z
    .string()
    .trim()
    .max(8192)
    .optional()
    .describe("CA certificate (PEM) used to verify a self-signed WinRM HTTPS listener (HTTPS only).")
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
      sslEnabled: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
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
