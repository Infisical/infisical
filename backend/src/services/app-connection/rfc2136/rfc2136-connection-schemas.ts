import net from "net";
import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { isBase64 } from "@app/lib/base64";
import { isValidDnsName, TsigAlgorithm } from "@app/lib/dns-update";
import { isValidHostname } from "@app/lib/validator/validate-hostname";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { Rfc2136ConnectionMethod } from "./rfc2136-connection-enums";

export const Rfc2136ConnectionTsigKeyCredentialsSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1, "Host required")
    .max(253, "Host cannot exceed 253 characters")
    .refine((value) => net.isIP(value) !== 0 || isValidHostname(value), {
      message: "Host must be a hostname or IP address, without a scheme or port (e.g. ns1.example.com)"
    })
    .describe("The hostname or IP address of the primary DNS server that accepts dynamic updates."),
  port: z.coerce
    .number()
    .int()
    .min(1, "Port must be between 1 and 65535")
    .max(65535, "Port must be between 1 and 65535")
    .describe("The TCP port the DNS server listens on, usually 53."),
  tsigKeyName: z
    .string()
    .trim()
    .min(1, "Key name required")
    .max(253, "Key name cannot exceed 253 characters")
    .refine(isValidDnsName, { message: "Key name must be a valid DNS name (e.g. infisical-acme)" })
    .describe("The name of the TSIG key, as configured on the DNS server."),
  tsigAlgorithm: z.nativeEnum(TsigAlgorithm).describe("The algorithm of the TSIG key. hmac-sha256 is recommended."),
  tsigSecret: z
    .string()
    .trim()
    .min(1, "Secret required")
    .max(1024, "Secret cannot exceed 1024 characters")
    .refine(isBase64, {
      message: "Secret must be base64. Copy only the value between the quotes in the key file."
    })
    .describe("The base64-encoded secret of the TSIG key.")
});

const BaseRfc2136ConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Rfc2136)
});

export const Rfc2136ConnectionSchema = BaseRfc2136ConnectionSchema.extend({
  method: z.literal(Rfc2136ConnectionMethod.TsigKey),
  credentials: Rfc2136ConnectionTsigKeyCredentialsSchema
});

export const SanitizedRfc2136ConnectionSchema = z.discriminatedUnion("method", [
  BaseRfc2136ConnectionSchema.extend({
    method: z.literal(Rfc2136ConnectionMethod.TsigKey),
    credentials: Rfc2136ConnectionTsigKeyCredentialsSchema.pick({
      host: true,
      port: true,
      tsigKeyName: true,
      tsigAlgorithm: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Rfc2136]} (TSIG Key)` }))
]);

export const ValidateRfc2136ConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(Rfc2136ConnectionMethod.TsigKey).describe(AppConnections.CREATE(AppConnection.Rfc2136).method),
    credentials: Rfc2136ConnectionTsigKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Rfc2136).credentials
    )
  })
]);

export const CreateRfc2136ConnectionSchema = ValidateRfc2136ConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Rfc2136, {
    supportsGateways: true
  })
);

export const UpdateRfc2136ConnectionSchema = z
  .object({
    credentials: Rfc2136ConnectionTsigKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Rfc2136).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.Rfc2136, {
      supportsGateways: true
    })
  );

export const Rfc2136ConnectionListItemSchema = z
  .object({
    name: z.literal("DNS Server (RFC 2136)"),
    app: z.literal(AppConnection.Rfc2136),
    methods: z.nativeEnum(Rfc2136ConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Rfc2136] }));
