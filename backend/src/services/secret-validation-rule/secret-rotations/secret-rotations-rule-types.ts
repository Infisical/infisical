import { z } from "zod";

import {
  CreateSecretRotationsValidationRuleSchema,
  SecretRotationsRuleConfigSchema,
  SecretRotationsValidationRuleSchema,
  UpdateSecretRotationsValidationRuleSchema
} from "./secret-rotations-rule-schemas";

export type TSecretRotationsValidationRule = z.infer<typeof SecretRotationsValidationRuleSchema>;
export type TSecretRotationsRuleConfig = z.infer<typeof SecretRotationsRuleConfigSchema>;
export type TSecretRotationsValidationRuleInput = z.infer<typeof CreateSecretRotationsValidationRuleSchema>;
export type TSecretRotationsValidationRuleUpdate = z.infer<typeof UpdateSecretRotationsValidationRuleSchema>;
