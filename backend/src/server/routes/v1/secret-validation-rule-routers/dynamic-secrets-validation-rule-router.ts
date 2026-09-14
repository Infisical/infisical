import {
  CreateDynamicSecretsValidationRuleSchema,
  DynamicSecretsValidationRuleSchema,
  UpdateDynamicSecretsValidationRuleSchema
} from "@app/services/secret-validation-rule/dynamic-secrets";
import { SecretValidationRuleType } from "@app/services/secret-validation-rule/secret-validation-rule-enums";

import { registerSecretValidationRuleEndpoints } from "./secret-validation-rule-endpoints";

export const registerDynamicSecretsValidationRuleRouter = async (server: FastifyZodProvider) =>
  registerSecretValidationRuleEndpoints({
    server,
    type: SecretValidationRuleType.DynamicSecrets,
    responseSchema: DynamicSecretsValidationRuleSchema,
    createSchema: CreateDynamicSecretsValidationRuleSchema,
    updateSchema: UpdateDynamicSecretsValidationRuleSchema
  });
