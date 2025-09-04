import { z } from "zod";

import { LogProvider } from "../audit-log-stream-enums";

export const CustomProviderCredentialsSchema = z.object({
  url: z.string().url().trim().min(1).max(255),
  headers: z
    .object({
      key: z.string().min(1),
      value: z.string().min(1)
    })
    .array()
});

export const CustomProviderSchema = z.object({
  provider: z.literal(LogProvider.Custom),
  credentials: CustomProviderCredentialsSchema
});

export const SanitizedCustomProviderSchema = z.object({
  provider: z.literal(LogProvider.Custom),
  credentials: z.object({
    url: CustomProviderCredentialsSchema.shape.url,
    // Only return header keys
    headers: CustomProviderCredentialsSchema.shape.headers.element.pick({ key: true }).array()
  })
});

export const CustomProviderListItemSchema = z.object({
  name: z.literal("Custom"),
  provider: z.literal(LogProvider.Custom)
});
