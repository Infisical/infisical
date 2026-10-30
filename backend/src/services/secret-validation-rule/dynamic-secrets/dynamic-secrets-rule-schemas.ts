import { z } from "zod";

import { SecretValidationRules } from "@app/lib/api-docs";

import { ConstraintTarget, DynamicSecretRuleProvider, SecretValidationRuleType } from "../secret-validation-rule-enums";
import {
  BaseSecretValidationRuleSchema,
  buildConstraintsSchema,
  GenericCreateSecretValidationRuleFieldsSchema,
  GenericUpdateSecretValidationRuleFieldsSchema,
  secretValidationRuleTitle
} from "../secret-validation-rule-schemas";

const TYPE = SecretValidationRuleType.DynamicSecrets;

const PasswordConstraintsSchema = buildConstraintsSchema(ConstraintTarget.GeneratedPassword);

const ProvidersSchema = z
  .array(z.nativeEnum(DynamicSecretRuleProvider))
  .min(1, "Select at least one provider")
  .describe(SecretValidationRules.DYNAMIC_SECRETS.providers);

export const DynamicSecretsRuleConfigSchema = z.object({
  providers: ProvidersSchema,
  passwordConstraints: PasswordConstraintsSchema.describe(
    SecretValidationRules.GENERATED_CREDENTIALS.passwordConstraints
  )
});

export const DynamicSecretsValidationRuleSchema = BaseSecretValidationRuleSchema.extend({
  type: z.literal(TYPE),
  ...DynamicSecretsRuleConfigSchema.shape
}).describe(secretValidationRuleTitle(TYPE));

export const CreateDynamicSecretsValidationRuleSchema = GenericCreateSecretValidationRuleFieldsSchema(TYPE).extend(
  DynamicSecretsRuleConfigSchema.shape
);

export const UpdateDynamicSecretsValidationRuleSchema = GenericUpdateSecretValidationRuleFieldsSchema(TYPE).extend({
  providers: ProvidersSchema.optional(),
  passwordConstraints: PasswordConstraintsSchema.optional().describe(
    SecretValidationRules.GENERATED_CREDENTIALS.passwordConstraints
  )
});
