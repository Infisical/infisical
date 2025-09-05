import { z } from "zod";

import { LogProvider } from "../audit-log-stream-enums";
import { BaseProviderSchema } from "../audit-log-stream-schemas";

export const CustomProviderCredentialsSchema = z.object({
  url: z.string().url().trim().min(1).max(255),
  headers: z
    .object({
      key: z.string().min(1),
      value: z.string().min(1)
    })
    .array()
});

const BaseCustomProviderSchema = BaseProviderSchema.extend({ provider: z.literal(LogProvider.Custom) });

export const CustomProviderSchema = BaseCustomProviderSchema.extend({
  credentials: CustomProviderCredentialsSchema
});

export const SanitizedCustomProviderSchema = BaseCustomProviderSchema.extend({
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

export const CreateCustomProviderLogStreamSchema = z.object({
  credentials: CustomProviderCredentialsSchema
});

export const UpdateCustomProviderLogStreamSchema = z.object({
  credentials: CustomProviderCredentialsSchema
});
