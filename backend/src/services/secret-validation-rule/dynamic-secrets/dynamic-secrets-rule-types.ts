import { z } from "zod";

import {
  CreateDynamicSecretsValidationRuleSchema,
  DynamicSecretsRuleConfigSchema,
  DynamicSecretsValidationRuleSchema,
  UpdateDynamicSecretsValidationRuleSchema
} from "./dynamic-secrets-rule-schemas";

export type TDynamicSecretsValidationRule = z.infer<typeof DynamicSecretsValidationRuleSchema>;
export type TDynamicSecretsRuleConfig = z.infer<typeof DynamicSecretsRuleConfigSchema>;
export type TDynamicSecretsValidationRuleInput = z.infer<typeof CreateDynamicSecretsValidationRuleSchema>;
export type TDynamicSecretsValidationRuleUpdate = z.infer<typeof UpdateDynamicSecretsValidationRuleSchema>;
