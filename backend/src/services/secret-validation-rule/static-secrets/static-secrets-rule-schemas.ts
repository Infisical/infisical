import { z } from "zod";

import { SecretValidationRules } from "@app/lib/api-docs";

import { ConstraintTarget, SecretValidationRuleType } from "../secret-validation-rule-enums";
import {
  BaseSecretValidationRuleSchema,
  buildConstraintsSchema,
  buildValueConstraintsSchema,
  GenericCreateSecretValidationRuleFieldsSchema,
  GenericUpdateSecretValidationRuleFieldsSchema,
  hasAnyConstraint,
  secretValidationRuleTitle
} from "../secret-validation-rule-schemas";

const TYPE = SecretValidationRuleType.StaticSecrets;

const KeyConstraintsSchema = buildConstraintsSchema(ConstraintTarget.SecretKey);
const ValueConstraintsSchema = buildValueConstraintsSchema(ConstraintTarget.SecretValue);

export const StaticSecretsRuleConfigSchema = z.object({
  keyConstraints: KeyConstraintsSchema.optional().describe(SecretValidationRules.STATIC_SECRETS.keyConstraints),
  valueConstraints: ValueConstraintsSchema.optional().describe(SecretValidationRules.STATIC_SECRETS.valueConstraints)
});

const NO_CONSTRAINTS_MESSAGE = "A rule must set at least one key or value constraint";

export const StaticSecretsValidationRuleSchema = BaseSecretValidationRuleSchema.extend({
  type: z.literal(TYPE),
  ...StaticSecretsRuleConfigSchema.shape
}).describe(secretValidationRuleTitle(TYPE));

export const CreateStaticSecretsValidationRuleSchema = GenericCreateSecretValidationRuleFieldsSchema(TYPE)
  .extend(StaticSecretsRuleConfigSchema.shape)
  .superRefine((rule, ctx) => {
    if (!hasAnyConstraint([rule.keyConstraints, rule.valueConstraints])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["keyConstraints"], message: NO_CONSTRAINTS_MESSAGE });
    }
  });

export const UpdateStaticSecretsValidationRuleSchema = GenericUpdateSecretValidationRuleFieldsSchema(TYPE).extend({
  keyConstraints: KeyConstraintsSchema.nullish().describe(SecretValidationRules.STATIC_SECRETS.keyConstraints),
  valueConstraints: ValueConstraintsSchema.nullish().describe(SecretValidationRules.STATIC_SECRETS.valueConstraints)
});
