import { z } from "zod";

import { LogProvider } from "../audit-log-stream-enums";
import { BaseProviderSchema } from "../audit-log-stream-schemas";

export const SumoLogicProviderCredentialsSchema = z.object({
  url: z.string().url().trim().min(1).max(255),
  token: z.string().trim().max(255).optional()
});

const BaseSumoLogicProviderSchema = BaseProviderSchema.extend({ provider: z.literal(LogProvider.SumoLogic) });

export const SumoLogicProviderSchema = BaseSumoLogicProviderSchema.extend({
  credentials: SumoLogicProviderCredentialsSchema
});

export const SanitizedSumoLogicProviderSchema = BaseSumoLogicProviderSchema.extend({
  credentials: SumoLogicProviderCredentialsSchema.pick({
    url: true
  })
});

export const SumoLogicProviderListItemSchema = z.object({
  name: z.literal("Sumo Logic"),
  provider: z.literal(LogProvider.SumoLogic)
});

export const CreateSumoLogicProviderLogStreamSchema = z.object({
  credentials: SumoLogicProviderCredentialsSchema
});

export const UpdateSumoLogicProviderLogStreamSchema = z.object({
  credentials: SumoLogicProviderCredentialsSchema
});
