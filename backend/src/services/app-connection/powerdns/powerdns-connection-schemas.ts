import RE2 from "re2";
import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { PowerDnsConnectionMethod } from "./powerdns-connection-enums";

const API_PATH_SUFFIX = new RE2("/api(/v\\d+)?/*$");
const SERVER_ID_FORMAT = new RE2("^[a-zA-Z0-9][a-zA-Z0-9._-]*$");

export const PowerDnsConnectionApiKeyCredentialsSchema = z.object({
  apiUrl: z
    .string()
    .trim()
    .url("API URL must be a valid URL")
    .max(512, "API URL cannot exceed 512 characters")
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
      message: "API URL must use http or https"
    })
    .refine((value) => !API_PATH_SUFFIX.test(new URL(value).pathname), {
      message:
        "API URL must not include the /api/v1 path, only the web server address (e.g. https://pdns.example.com:8081)"
    })
    .describe("The base URL of the PowerDNS web server, excluding the /api/v1 path."),
  apiKey: z
    .string()
    .trim()
    .min(1, "API key required")
    .max(512, "API key cannot exceed 512 characters")
    .describe("The value of the PowerDNS api-key setting."),
  serverId: z
    .string()
    .trim()
    .max(64, "Server ID cannot exceed 64 characters")
    .refine((value) => !value || SERVER_ID_FORMAT.test(value), {
      message: "Server ID may only contain letters, numbers, dots, hyphens and underscores"
    })
    .refine((value) => !value.includes(".."), { message: "Server ID cannot contain '..'" })
    .transform((value) => value || undefined)
    .optional()
    .describe(
      "The PowerDNS API server ID. Leave unset unless you connect through a proxy fronting several servers; the Authoritative Server always reports 'localhost'."
    ),
  sslRejectUnauthorized: z
    .boolean()
    .optional()
    .describe("Whether to reject PowerDNS TLS certificates that are not trusted. Defaults to true."),
  sslCertificate: z
    .string()
    .trim()
    .max(8192, "SSL certificate cannot exceed 8192 characters")
    .transform((value) => value || undefined)
    .optional()
    .describe("A PEM-encoded CA certificate to trust when connecting to PowerDNS over HTTPS.")
});

const BasePowerDnsConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.PowerDns)
});

export const PowerDnsConnectionSchema = BasePowerDnsConnectionSchema.extend({
  method: z.literal(PowerDnsConnectionMethod.ApiKey),
  credentials: PowerDnsConnectionApiKeyCredentialsSchema
});

export const SanitizedPowerDnsConnectionSchema = z.discriminatedUnion("method", [
  BasePowerDnsConnectionSchema.extend({
    method: z.literal(PowerDnsConnectionMethod.ApiKey),
    credentials: PowerDnsConnectionApiKeyCredentialsSchema.pick({
      apiUrl: true,
      serverId: true,
      sslRejectUnauthorized: true,
      sslCertificate: true
    })
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.PowerDns]} (API Key)` }))
]);

export const ValidatePowerDnsConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(PowerDnsConnectionMethod.ApiKey).describe(AppConnections.CREATE(AppConnection.PowerDns).method),
    credentials: PowerDnsConnectionApiKeyCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.PowerDns).credentials
    )
  })
]);

export const CreatePowerDnsConnectionSchema = ValidatePowerDnsConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.PowerDns, {
    supportsGateways: true
  })
);

export const UpdatePowerDnsConnectionSchema = z
  .object({
    credentials: PowerDnsConnectionApiKeyCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.PowerDns).credentials
    )
  })
  .and(
    GenericUpdateAppConnectionFieldsSchema(AppConnection.PowerDns, {
      supportsGateways: true
    })
  );

export const PowerDnsConnectionListItemSchema = z
  .object({
    name: z.literal("PowerDNS"),
    app: z.literal(AppConnection.PowerDns),
    methods: z.nativeEnum(PowerDnsConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.PowerDns] }));
