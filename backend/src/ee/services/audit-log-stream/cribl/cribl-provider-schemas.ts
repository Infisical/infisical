import { z } from "zod";

import { LogProvider } from "../audit-log-stream-enums";
import { BaseProviderSchema } from "../audit-log-stream-schemas";

export const CriblProviderCredentialsSchema = z.object({
  url: z.string().url().trim().min(1).max(255),
  token: z.string().trim().min(21).max(255)
});

const BaseCriblProviderSchema = BaseProviderSchema.extend({ provider: z.literal(LogProvider.Cribl) });

export const CriblProviderSchema = BaseCriblProviderSchema.extend({
  credentials: CriblProviderCredentialsSchema
});

export const SanitizedCriblProviderSchema = BaseCriblProviderSchema.extend({
  credentials: CriblProviderCredentialsSchema.pick({
    url: true
  })
});

export const CriblProviderListItemSchema = z.object({
  name: z.literal("Cribl"),
  provider: z.literal(LogProvider.Cribl)
});

export const CreateCriblProviderLogStreamSchema = z.object({
  credentials: CriblProviderCredentialsSchema
});

export const UpdateCriblProviderLogStreamSchema = z.object({
  credentials: CriblProviderCredentialsSchema
});
