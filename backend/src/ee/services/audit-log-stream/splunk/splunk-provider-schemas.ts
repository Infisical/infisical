import { z } from "zod";

import { LogProvider } from "../audit-log-stream-enums";

export const SplunkProviderCredentialsSchema = z.object({
  hostname: z.string().url().trim().min(1).max(255),
  token: z.string().uuid().trim().min(1)
});

export const SplunkProviderSchema = z.object({
  provider: z.literal(LogProvider.Splunk),
  credentials: SplunkProviderCredentialsSchema
});

export const SanitizedSplunkProviderSchema = z.object({
  provider: z.literal(LogProvider.Splunk),
  credentials: SplunkProviderCredentialsSchema.pick({
    hostname: true
  })
});

export const SplunkProviderListItemSchema = z.object({
  name: z.literal("Splunk"),
  provider: z.literal(LogProvider.Splunk)
});
