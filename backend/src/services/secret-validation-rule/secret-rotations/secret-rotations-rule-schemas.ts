import { z } from "zod";

import { SecretValidationRules } from "@app/lib/api-docs";

import {
  ConstraintTarget,
  SecretRotationRuleProvider,
  SecretValidationRuleType
} from "../secret-validation-rule-enums";
import {
  BaseSecretValidationRuleSchema,
  buildConstraintsSchema,
  GenericCreateSecretValidationRuleFieldsSchema,
  GenericUpdateSecretValidationRuleFieldsSchema,
  secretValidationRuleTitle
} from "../secret-validation-rule-schemas";

const TYPE = SecretValidationRuleType.SecretRotations;

const PasswordConstraintsSchema = buildConstraintsSchema(ConstraintTarget.GeneratedPassword);

const ProvidersSchema = z
  .array(z.nativeEnum(SecretRotationRuleProvider))
  .min(1, "Select at least one provider")
  .describe(SecretValidationRules.SECRET_ROTATIONS.providers);

export const SecretRotationsRuleConfigSchema = z.object({
  providers: ProvidersSchema,
  passwordConstraints: PasswordConstraintsSchema.describe(
    SecretValidationRules.GENERATED_CREDENTIALS.passwordConstraints
  )
});

export const SecretRotationsValidationRuleSchema = BaseSecretValidationRuleSchema.extend({
  type: z.literal(TYPE),
  ...SecretRotationsRuleConfigSchema.shape
}).describe(secretValidationRuleTitle(TYPE));

export const CreateSecretRotationsValidationRuleSchema = GenericCreateSecretValidationRuleFieldsSchema(TYPE).extend(
  SecretRotationsRuleConfigSchema.shape
);

export const UpdateSecretRotationsValidationRuleSchema = GenericUpdateSecretValidationRuleFieldsSchema(TYPE).extend({
  providers: ProvidersSchema.optional(),
  passwordConstraints: PasswordConstraintsSchema.optional().describe(
    SecretValidationRules.GENERATED_CREDENTIALS.passwordConstraints
  )
});
