import { SecretValidationRuleType } from "@app/services/secret-validation-rule/secret-validation-rule-enums";

import { registerDynamicSecretsValidationRuleRouter } from "./dynamic-secrets-validation-rule-router";
import { registerSecretRotationsValidationRuleRouter } from "./secret-rotations-validation-rule-router";
import { registerStaticSecretsValidationRuleRouter } from "./static-secrets-validation-rule-router";

export * from "./secret-validation-rule-router";

export const SECRET_VALIDATION_RULE_REGISTER_ROUTER_MAP: Record<
  SecretValidationRuleType,
  (server: FastifyZodProvider) => Promise<void>
> = {
  [SecretValidationRuleType.StaticSecrets]: registerStaticSecretsValidationRuleRouter,
  [SecretValidationRuleType.DynamicSecrets]: registerDynamicSecretsValidationRuleRouter,
  [SecretValidationRuleType.SecretRotations]: registerSecretRotationsValidationRuleRouter
};
