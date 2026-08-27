import { z } from "zod";

import { LogProvider, StreamMode } from "../audit-log-stream-enums";
import { BaseProviderSchema } from "../audit-log-stream-schemas";

export const SPLUNK_ENTERPRISE_HEC_PORT = 8088;
export const SPLUNK_CLOUD_HEC_PORT = 443;

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
  port: z
    .union([z.literal(SPLUNK_ENTERPRISE_HEC_PORT), z.literal(SPLUNK_CLOUD_HEC_PORT)], {
      errorMap: () => ({
        message: `Port must be ${SPLUNK_ENTERPRISE_HEC_PORT} or ${SPLUNK_CLOUD_HEC_PORT}`
      })
    })
    .optional(),
  token: z.string().uuid().trim().min(1)
});

const BaseSplunkProviderSchema = BaseProviderSchema.extend({ provider: z.literal(LogProvider.Splunk) });

export const SplunkProviderSchema = BaseSplunkProviderSchema.extend({
  credentials: SplunkProviderCredentialsSchema
});

export const SanitizedSplunkProviderSchema = BaseSplunkProviderSchema.extend({
  credentials: SplunkProviderCredentialsSchema.pick({
    hostname: true,
    port: true
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
  credentials: SplunkProviderCredentialsSchema,
  streamMode: z.nativeEnum(StreamMode).optional()
});
