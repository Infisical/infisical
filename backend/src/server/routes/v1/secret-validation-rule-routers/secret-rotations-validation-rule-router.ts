import {
  CreateSecretRotationsValidationRuleSchema,
  SecretRotationsValidationRuleSchema,
  UpdateSecretRotationsValidationRuleSchema
} from "@app/services/secret-validation-rule/secret-rotations";
import { SecretValidationRuleType } from "@app/services/secret-validation-rule/secret-validation-rule-enums";

import { registerSecretValidationRuleEndpoints } from "./secret-validation-rule-endpoints";

export const registerSecretRotationsValidationRuleRouter = async (server: FastifyZodProvider) =>
  registerSecretValidationRuleEndpoints({
    server,
    type: SecretValidationRuleType.SecretRotations,
    responseSchema: SecretRotationsValidationRuleSchema,
    createSchema: CreateSecretRotationsValidationRuleSchema,
    updateSchema: UpdateSecretRotationsValidationRuleSchema
  });
