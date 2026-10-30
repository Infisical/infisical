import { z } from "zod";

import {
  CreateStaticSecretsValidationRuleSchema,
  StaticSecretsRuleConfigSchema,
  StaticSecretsValidationRuleSchema,
  UpdateStaticSecretsValidationRuleSchema
} from "./static-secrets-rule-schemas";

export type TStaticSecretsValidationRule = z.infer<typeof StaticSecretsValidationRuleSchema>;
export type TStaticSecretsRuleConfig = z.infer<typeof StaticSecretsRuleConfigSchema>;
export type TStaticSecretsValidationRuleInput = z.infer<typeof CreateStaticSecretsValidationRuleSchema>;
export type TStaticSecretsValidationRuleUpdate = z.infer<typeof UpdateStaticSecretsValidationRuleSchema>;
