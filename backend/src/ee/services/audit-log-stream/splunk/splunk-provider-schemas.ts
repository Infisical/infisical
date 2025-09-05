import { z } from "zod";

import { LogProvider } from "../audit-log-stream-enums";
import { BaseProviderSchema } from "../audit-log-stream-schemas";

export const SplunkProviderCredentialsSchema = z.object({
  hostname: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .superRefine((val, ctx) => {
      if (val.includes("://")) {
        ctx.addIssue({
          code: "custom",
          message: "Hostname should not include protocol"
        });
        return;
      }

      try {
        const url = new URL(`https://${val}`);
        if (url.hostname !== val) {
          ctx.addIssue({
            code: "custom",
            message: "Must be a valid hostname without port or path"
          });
        }
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid hostname" });
      }
    }),
  token: z.string().uuid().trim().min(1)
});

const BaseSplunkProviderSchema = BaseProviderSchema.extend({ provider: z.literal(LogProvider.Splunk) });

export const SplunkProviderSchema = BaseSplunkProviderSchema.extend({
  credentials: SplunkProviderCredentialsSchema
});

export const SanitizedSplunkProviderSchema = BaseSplunkProviderSchema.extend({
  credentials: SplunkProviderCredentialsSchema.pick({
    hostname: true
  })
});

export const SplunkProviderListItemSchema = z.object({
  name: z.literal("Splunk"),
  provider: z.literal(LogProvider.Splunk)
});

export const CreateSplunkProviderLogStreamSchema = z.object({
  credentials: SplunkProviderCredentialsSchema
});

export const UpdateSplunkProviderLogStreamSchema = z.object({
  credentials: SplunkProviderCredentialsSchema
});
