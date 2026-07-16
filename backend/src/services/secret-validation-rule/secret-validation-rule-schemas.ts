import { z } from "zod";

import { SecretValidationRulesSchema } from "@app/db/schemas";

import {
  ConstraintTarget,
  ConstraintType,
  DynamicSecretRuleProvider,
  SecretRotationRuleProvider,
  SecretValidationRuleType,
  TSecretValidationRuleInputs
} from "./secret-validation-rule-types";

export const MAX_PREVENT_VALUE_REUSE_VERSIONS = 25;

// Targets that constraints are allowed to apply to per rule type.
// Generated-credential rules currently only target the generated password
// (the username slot is reserved for future use).
const STATIC_RULE_TARGETS = new Set<ConstraintTarget>([ConstraintTarget.SecretKey, ConstraintTarget.SecretValue]);
const GENERATED_RULE_TARGETS = new Set<ConstraintTarget>([ConstraintTarget.GeneratedPassword]);

// Constraint types disallowed on generated-credential rules (dynamic secrets
// and secret rotations). PreventValueReuse is intentionally static-secret-only:
// for dynamic secrets it has no anchor (each lease is independent and ephemeral),
// and for rotations we explicitly want users to drive uniqueness through
// password generation (length/regex) rather than a reuse check that would
// surface a rotation as a failed lease at issue time.
const GENERATED_RULE_DISALLOWED_CONSTRAINTS = new Set<ConstraintType>([ConstraintType.PreventValueReuse]);

const baseConstraintSchema = z.object({
  type: z.nativeEnum(ConstraintType),
  appliesTo: z.nativeEnum(ConstraintTarget),
  value: z.string()
});

const valueRequiredRefinement = (c: z.infer<typeof baseConstraintSchema>) =>
  c.type === ConstraintType.PreventValueReuse || c.value.length > 0;

const preventValueReuseTargetRefinement = (c: z.infer<typeof baseConstraintSchema>) =>
  c.type !== ConstraintType.PreventValueReuse || c.appliesTo === ConstraintTarget.SecretValue;

const preventValueReuseRangeRefinement = (c: z.infer<typeof baseConstraintSchema>) => {
  if (c.type !== ConstraintType.PreventValueReuse) return true;
  const num = Number(c.value);
  return Number.isInteger(num) && num >= 1 && num <= MAX_PREVENT_VALUE_REUSE_VERSIONS;
};

export const constraintSchema = baseConstraintSchema
  .refine(valueRequiredRefinement, { message: "Value is required", path: ["value"] })
  .refine(preventValueReuseTargetRefinement, {
    message: "No value reuse constraint can only apply to secret values",
    path: ["appliesTo"]
  })
  .refine(preventValueReuseRangeRefinement, {
    message: `Prevent value reuse version count must be between 1 and ${MAX_PREVENT_VALUE_REUSE_VERSIONS}`,
    path: ["value"]
  });

const buildConstraintSchemaForRuleType = (ruleType: SecretValidationRuleType) => {
  const allowedTargets =
    ruleType === SecretValidationRuleType.StaticSecrets ? STATIC_RULE_TARGETS : GENERATED_RULE_TARGETS;
  const disallowedTypes =
    ruleType === SecretValidationRuleType.StaticSecrets
      ? new Set<ConstraintType>()
      : GENERATED_RULE_DISALLOWED_CONSTRAINTS;

  return baseConstraintSchema
    .refine((c) => allowedTargets.has(c.appliesTo), {
      message: `Constraint target is not allowed for ${ruleType} rules`,
      path: ["appliesTo"]
    })
    .refine((c) => !disallowedTypes.has(c.type), {
      message: `Constraint type is not supported for ${ruleType} rules`,
      path: ["type"]
    })
    .refine(valueRequiredRefinement, { message: "Value is required", path: ["value"] })
    .refine(preventValueReuseTargetRefinement, {
      message: "No value reuse constraint can only apply to secret values",
      path: ["appliesTo"]
    })
    .refine(preventValueReuseRangeRefinement, {
      message: `Prevent value reuse version count must be between 1 and ${MAX_PREVENT_VALUE_REUSE_VERSIONS}`,
      path: ["value"]
    });
};

export const staticSecretsInputsSchema = z.object({
  constraints: z.array(buildConstraintSchemaForRuleType(SecretValidationRuleType.StaticSecrets)).min(1)
});

export const dynamicSecretsInputsSchema = z.object({
  providers: z.array(z.nativeEnum(DynamicSecretRuleProvider)).min(1, "Select at least one provider"),
  constraints: z.array(buildConstraintSchemaForRuleType(SecretValidationRuleType.DynamicSecrets)).min(1)
});

export const secretRotationsInputsSchema = z.object({
  providers: z.array(z.nativeEnum(SecretRotationRuleProvider)).min(1, "Select at least one provider"),
  constraints: z.array(buildConstraintSchemaForRuleType(SecretValidationRuleType.SecretRotations)).min(1)
});

// Discriminated union for create/update request bodies
export const SecretValidationRuleInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(SecretValidationRuleType.StaticSecrets), inputs: staticSecretsInputsSchema }),
  z.object({ type: z.literal(SecretValidationRuleType.DynamicSecrets), inputs: dynamicSecretsInputsSchema }),
  z.object({ type: z.literal(SecretValidationRuleType.SecretRotations), inputs: secretRotationsInputsSchema })
]);

// Map of type → inputs schema, used for runtime parsing
const inputsSchemaMap: Record<SecretValidationRuleType, z.ZodSchema<TSecretValidationRuleInputs>> = {
  [SecretValidationRuleType.StaticSecrets]: staticSecretsInputsSchema,
  [SecretValidationRuleType.DynamicSecrets]: dynamicSecretsInputsSchema,
  [SecretValidationRuleType.SecretRotations]: secretRotationsInputsSchema
};

export const parseSecretValidationRuleInputs = (type: string, inputs: unknown) => {
  const schema = inputsSchemaMap[type as SecretValidationRuleType];
  if (!schema) {
    throw new Error(`Unknown secret validation rule type: ${type}`);
  }
  return schema.parse(inputs);
};

export const SecretValidationRuleResponseSchema = SecretValidationRulesSchema.omit({
  type: true,
  encryptedInputs: true
}).and(SecretValidationRuleInputSchema);
