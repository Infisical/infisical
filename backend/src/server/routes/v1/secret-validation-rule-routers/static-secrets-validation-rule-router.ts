import { SecretValidationRuleType } from "@app/services/secret-validation-rule/secret-validation-rule-enums";
import {
  CreateStaticSecretsValidationRuleSchema,
  StaticSecretsValidationRuleSchema,
  UpdateStaticSecretsValidationRuleSchema
} from "@app/services/secret-validation-rule/static-secrets";

import { registerSecretValidationRuleEndpoints } from "./secret-validation-rule-endpoints";

export const registerStaticSecretsValidationRuleRouter = async (server: FastifyZodProvider) =>
  registerSecretValidationRuleEndpoints({
    server,
    type: SecretValidationRuleType.StaticSecrets,
    responseSchema: StaticSecretsValidationRuleSchema,
    createSchema: CreateStaticSecretsValidationRuleSchema,
    updateSchema: UpdateStaticSecretsValidationRuleSchema
  });
