import RE2 from "re2";
import { z } from "zod";

import { LogProvider } from "../audit-log-stream-enums";
import { BaseProviderSchema } from "../audit-log-stream-schemas";

export const AzureProviderCredentialsSchema = z.object({
  tenantId: z.string().trim().uuid(),
  clientId: z.string().trim().uuid(),
  clientSecret: z.string().trim().length(40),

  // Data Collection Endpoint URL
  dceUrl: z.string().trim().url().min(1).max(255),

  // Data Collection Rule Immutable ID
  dcrId: z
    .string()
    .trim()
    .refine((val) => new RE2(/^dcr-[0-9a-f]{32}$/).test(val), "DCR ID must be in dcr-*** format"),

  // Custom Log Table Name
  cltName: z.string().trim().min(1).max(255)
});

const BaseAzureProviderSchema = BaseProviderSchema.extend({ provider: z.literal(LogProvider.Azure) });

export const AzureProviderSchema = BaseAzureProviderSchema.extend({
  credentials: AzureProviderCredentialsSchema
});

export const SanitizedAzureProviderSchema = BaseAzureProviderSchema.extend({
  credentials: AzureProviderCredentialsSchema.pick({
    tenantId: true,
    clientId: true,
    dceUrl: true,
    dcrId: true,
    cltName: true
  })
});

export const AzureProviderListItemSchema = z.object({
  name: z.literal("Azure"),
  provider: z.literal(LogProvider.Azure)
});

export const CreateAzureProviderLogStreamSchema = z.object({
  credentials: AzureProviderCredentialsSchema
});

export const UpdateAzureProviderLogStreamSchema = z.object({
  credentials: AzureProviderCredentialsSchema
});
