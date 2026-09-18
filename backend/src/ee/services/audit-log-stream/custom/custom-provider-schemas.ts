import RE2 from "re2";
import { z } from "zod";

import { LogProvider, REDACTED_CREDENTIAL_VALUE, StreamMode } from "../audit-log-stream-enums";
import { BaseProviderSchema } from "../audit-log-stream-schemas";

export const CustomProviderCredentialsSchema = z.object({
  url: z.string().url().trim().min(1).max(255),
  headers: z
    .object({
      key: z
        .string()
        .min(1)
        .refine((val) => new RE2(/^[^\n\r]+$/).test(val), "Header keys cannot contain newlines or carriage returns"),
      value: z
        .string()
        .min(1)
        .refine((val) => new RE2(/^[^\n\r]+$/).test(val), "Header values cannot contain newlines or carriage returns")
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
    // Return header keys and a redacted value
    headers: CustomProviderCredentialsSchema.shape.headers.transform((headers) =>
      headers.map((header) => ({ ...header, value: REDACTED_CREDENTIAL_VALUE }))
    )
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
  credentials: CustomProviderCredentialsSchema,
  // Custom streams migrated to "single" can pass "batch" here to upgrade (one-way).
  streamMode: z.nativeEnum(StreamMode).optional()
});
