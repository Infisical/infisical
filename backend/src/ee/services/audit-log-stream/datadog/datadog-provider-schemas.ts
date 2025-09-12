import RE2 from "re2";
import { z } from "zod";

import { LogProvider } from "../audit-log-stream-enums";
import { BaseProviderSchema } from "../audit-log-stream-schemas";

export const DatadogProviderCredentialsSchema = z.object({
  url: z.string().url().trim().min(1).max(255),
  token: z
    .string()
    .trim()
    .refine((val) => new RE2(/^[a-fA-F0-9]{32}$/).test(val), "Invalid Datadog API key format")
});

const BaseDatadogProviderSchema = BaseProviderSchema.extend({ provider: z.literal(LogProvider.Datadog) });

export const DatadogProviderSchema = BaseDatadogProviderSchema.extend({
  credentials: DatadogProviderCredentialsSchema
});

export const SanitizedDatadogProviderSchema = BaseDatadogProviderSchema.extend({
  credentials: DatadogProviderCredentialsSchema.pick({
    url: true
  })
});

export const DatadogProviderListItemSchema = z.object({
  name: z.literal("Datadog"),
  provider: z.literal(LogProvider.Datadog)
});

export const CreateDatadogProviderLogStreamSchema = z.object({
  credentials: DatadogProviderCredentialsSchema
});

export const UpdateDatadogProviderLogStreamSchema = z.object({
  credentials: DatadogProviderCredentialsSchema
});
