import { z } from "zod";

import {
  AuditLogStreamProduct,
  LogProvider,
  REDACTED_CREDENTIAL_VALUE,
  SPLUNK_DEFAULT_HEC_PORT,
  StreamMode
} from "@app/hooks/api/auditLogStreams/enums";
import type { TAuditLogStream } from "@app/hooks/api/auditLogStreams/types";

export type FormProvider = Exclude<LogProvider, LogProvider.QRadar>;

export const PRODUCT_LABELS: Record<AuditLogStreamProduct, string> = {
  [AuditLogStreamProduct.SecretManager]: "Secret Management",
  [AuditLogStreamProduct.CertificateManager]: "Certificate Manager",
  [AuditLogStreamProduct.KMS]: "KMS",
  [AuditLogStreamProduct.SecretScanning]: "Secret Scanning",
  [AuditLogStreamProduct.PAM]: "PAM",
  [AuditLogStreamProduct.AgentVault]: "Agent Vault",
  [AuditLogStreamProduct.Organization]: "Organization"
};

export const PRODUCTS = [
  AuditLogStreamProduct.Organization,
  AuditLogStreamProduct.SecretManager,
  AuditLogStreamProduct.CertificateManager,
  AuditLogStreamProduct.KMS,
  AuditLogStreamProduct.SecretScanning,
  AuditLogStreamProduct.PAM,
  AuditLogStreamProduct.AgentVault
];

export const sortProducts = (products: readonly AuditLogStreamProduct[]) =>
  [...products].sort((a, b) =>
    PRODUCT_LABELS[a].localeCompare(PRODUCT_LABELS[b], undefined, { sensitivity: "base" })
  );

export const DATADOG_ENDPOINTS = [
  { label: "Datadog US1", value: "https://http-intake.logs.datadoghq.com/api/v2/logs" },
  { label: "Datadog US3", value: "https://http-intake.logs.us3.datadoghq.com/api/v2/logs" },
  { label: "Datadog US5", value: "https://http-intake.logs.us5.datadoghq.com/api/v2/logs" },
  { label: "Datadog EU", value: "https://http-intake.logs.datadoghq.eu/api/v2/logs" },
  { label: "Datadog AP1", value: "https://http-intake.logs.ap1.datadoghq.com/api/v2/logs" },
  { label: "Datadog AP2", value: "https://http-intake.logs.ap2.datadoghq.com/api/v2/logs" },
  {
    label: "Datadog GovCloud (US1-FED)",
    value: "https://http-intake.logs.ddog-gov.com/api/v2/logs"
  }
];

const secret = (schema: z.ZodString) =>
  z
    .string()
    .superRefine((value, ctx) => {
      if (value === REDACTED_CREDENTIAL_VALUE) return;
      const result = schema.safeParse(value);
      if (!result.success)
        ctx.addIssue({ code: "custom", message: result.error.issues[0].message });
    })
    .transform((value) => value.trim());

const url = z.string().trim().url("Enter a valid URL").max(255);

const hostname = z
  .string()
  .trim()
  .min(1, "Required")
  .max(255)
  .superRefine((value, ctx) => {
    if (value.includes("://")) {
      ctx.addIssue({ code: "custom", message: "Hostname should not include protocol" });
      return;
    }
    try {
      if (new URL(`https://${value}`).hostname !== value)
        ctx.addIssue({ code: "custom", message: "Must be a valid hostname without port or path" });
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid hostname" });
    }
  });

export const CREDENTIAL_SCHEMAS: Record<FormProvider, z.ZodTypeAny> = {
  [LogProvider.Azure]: z.object({
    tenantId: z.string().trim().uuid("Enter a valid UUID"),
    clientId: z.string().trim().uuid("Enter a valid UUID"),
    clientSecret: secret(z.string().trim().length(40, "Client secret must be 40 characters")),
    dceUrl: url,
    dcrId: z
      .string()
      .trim()
      .regex(/^dcr-[0-9a-f]{32}$/, "DCR ID must be in dcr-*** format"),
    cltName: z.string().trim().min(1, "Required").max(255)
  }),
  [LogProvider.Cribl]: z.object({
    url,
    token: secret(z.string().trim().min(21, "Token must be at least 21 characters").max(255))
  }),
  [LogProvider.Custom]: z.object({
    url,
    headers: z
      .object({ key: z.string().min(1, "Required"), value: z.string().min(1, "Required") })
      .array()
  }),
  [LogProvider.Datadog]: z.object({
    url,
    token: secret(
      z
        .string()
        .trim()
        .regex(/^[a-fA-F0-9]{32}$/, "Invalid Datadog API key format")
    )
  }),
  [LogProvider.Splunk]: z.object({
    hostname,
    port: z.coerce
      .number({ invalid_type_error: "Port must be a number" })
      .int("Port must be a whole number")
      .min(1, "Port must be between 1 and 65535")
      .max(65535, "Port must be between 1 and 65535"),
    token: secret(z.string().trim().uuid("Enter a valid HEC token"))
  }),
  [LogProvider.SumoLogic]: z.object({
    url,
    token: secret(z.string().trim().min(1, "Required").max(255))
  })
};

export type StreamFormValues = {
  credentials: Record<string, unknown>;
  streamMode?: StreamMode;
  products: AuditLogStreamProduct[];
};

export const streamFormSchema = (provider: FormProvider) =>
  z.object({
    credentials: CREDENTIAL_SCHEMAS[provider],
    streamMode: z.nativeEnum(StreamMode).optional(),
    products: z.nativeEnum(AuditLogStreamProduct).array()
  });

const emptyCredentials: Record<FormProvider, Record<string, unknown>> = {
  [LogProvider.Azure]: {
    tenantId: "",
    clientId: "",
    clientSecret: "",
    dceUrl: "",
    dcrId: "",
    cltName: ""
  },
  [LogProvider.Cribl]: { url: "", token: "" },
  [LogProvider.Custom]: { url: "", headers: [] },
  [LogProvider.Datadog]: { url: DATADOG_ENDPOINTS[0].value, token: "" },
  [LogProvider.Splunk]: { hostname: "", port: SPLUNK_DEFAULT_HEC_PORT, token: "" },
  [LogProvider.SumoLogic]: { url: "", token: "" }
};

export const toFormValues = (
  provider: FormProvider,
  stream?: TAuditLogStream
): StreamFormValues => {
  if (!stream) return { credentials: emptyCredentials[provider], products: [] };
  const credentials: Record<string, unknown> = { ...stream.credentials };
  if (stream.provider === LogProvider.Splunk)
    credentials.port = stream.credentials.port ?? SPLUNK_DEFAULT_HEC_PORT;
  return {
    credentials,
    streamMode: stream.streamMode ?? StreamMode.Batch,
    products: stream.filters?.products ?? []
  };
};

export const hasStreamMode = (provider: LogProvider) =>
  provider === LogProvider.Custom || provider === LogProvider.Cribl;
