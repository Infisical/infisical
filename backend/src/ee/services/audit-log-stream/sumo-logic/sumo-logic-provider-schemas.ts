import { z } from "zod";

import { LogProvider, REDACTED_CREDENTIAL_VALUE } from "../audit-log-stream-enums";
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
  credentials: z.object({
    url: SumoLogicProviderCredentialsSchema.shape.url,
    // Mask the token with a placeholder when one is set (and omit it when unset) so the value is
    // never exposed but the frontend can still tell a token exists. On update the frontend sends
    // this placeholder back unchanged to signal "keep the existing token".
    token: SumoLogicProviderCredentialsSchema.shape.token.transform((token) =>
      token ? REDACTED_CREDENTIAL_VALUE : undefined
    )
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
