import { z } from "zod";

import { SecretValidationRulesSchema } from "@app/db/schemas";
import { SECRET_VALIDATION_RULES } from "@app/lib/api-docs";

import {
  ConstraintTarget,
  ConstraintType,
  DynamicSecretRuleProvider,
  SecretRotationRuleProvider,
  SecretValidationRuleType,
  TSecretValidationRuleInputs
} from "./secret-validation-rule-types";

export const MAX_PREVENT_VALUE_REUSE_VERSIONS = 25;

const STATIC_RULE_TARGETS = [ConstraintTarget.SecretKey, ConstraintTarget.SecretValue] as const;
const GENERATED_RULE_TARGETS = [ConstraintTarget.GeneratedPassword] as const;

const GENERATED_CONSTRAINT_TYPES = [
  ConstraintType.MinLength,
  ConstraintType.MaxLength,
  ConstraintType.RegexPattern,
  ConstraintType.RequiredPrefix,
  ConstraintType.RequiredSuffix
] as const;
const STATIC_CONSTRAINT_TYPES = [...GENERATED_CONSTRAINT_TYPES, ConstraintType.PreventValueReuse] as const;

/** Embed description + example so Mintlify/OpenAPI curl samples include enum fields. */
const openApiField = (description: string, example: string) => JSON.stringify({ description, example });

type TConstraintInput = {
  type: ConstraintType;
  appliesTo: ConstraintTarget;
  value: string;
};

const valueRequiredRefinement = (c: TConstraintInput) =>
  c.type === ConstraintType.PreventValueReuse || c.value.length > 0;

const preventValueReuseTargetRefinement = (c: TConstraintInput) =>
  c.type !== ConstraintType.PreventValueReuse || c.appliesTo === ConstraintTarget.SecretValue;

const preventValueReuseRangeRefinement = (c: TConstraintInput) => {
  if (c.type !== ConstraintType.PreventValueReuse) return true;
  const num = Number(c.value);
  return Number.isInteger(num) && num >= 1 && num <= MAX_PREVENT_VALUE_REUSE_VERSIONS;
};

const withConstraintRefinements = <T extends z.ZodType<TConstraintInput>>(schema: T) =>
  schema
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
  if (ruleType === SecretValidationRuleType.StaticSecrets) {
    return withConstraintRefinements(
      z.object({
        type: z
          .enum(STATIC_CONSTRAINT_TYPES)
          .describe(openApiField(SECRET_VALIDATION_RULES.RULE.constraintTypeStatic, ConstraintType.MinLength)),
        appliesTo: z
          .enum(STATIC_RULE_TARGETS)
          .describe(openApiField(SECRET_VALIDATION_RULES.RULE.appliesToStatic, ConstraintTarget.SecretValue)),
        value: z.string().describe(openApiField(SECRET_VALIDATION_RULES.RULE.constraintValue, "8"))
      })
    );
  }

  return withConstraintRefinements(
    z.object({
      type: z
        .enum(GENERATED_CONSTRAINT_TYPES)
        .describe(openApiField(SECRET_VALIDATION_RULES.RULE.constraintTypeGenerated, ConstraintType.MinLength)),
      appliesTo: z
        .enum(GENERATED_RULE_TARGETS)
        .describe(openApiField(SECRET_VALIDATION_RULES.RULE.appliesToGenerated, ConstraintTarget.GeneratedPassword)),
      value: z.string().describe(openApiField(SECRET_VALIDATION_RULES.RULE.constraintValue, "8"))
    })
  );
};

export const staticSecretsInputsSchema = z.object({
  constraints: z
    .array(buildConstraintSchemaForRuleType(SecretValidationRuleType.StaticSecrets))
    .min(1)
    .describe(SECRET_VALIDATION_RULES.RULE.constraints)
});

export const dynamicSecretsInputsSchema = z.object({
  providers: z
    .array(z.nativeEnum(DynamicSecretRuleProvider))
    .min(1, "Select at least one provider")
    .describe(SECRET_VALIDATION_RULES.RULE.dynamicSecretProviders),
  constraints: z
    .array(buildConstraintSchemaForRuleType(SecretValidationRuleType.DynamicSecrets))
    .min(1)
    .describe(SECRET_VALIDATION_RULES.RULE.constraints)
});

export const secretRotationsInputsSchema = z.object({
  providers: z
    .array(z.nativeEnum(SecretRotationRuleProvider))
    .min(1, "Select at least one provider")
    .describe(SECRET_VALIDATION_RULES.RULE.secretRotationProviders),
  constraints: z
    .array(buildConstraintSchemaForRuleType(SecretValidationRuleType.SecretRotations))
    .min(1)
    .describe(SECRET_VALIDATION_RULES.RULE.constraints)
});

// Discriminated union for create request bodies / API responses.
// Constraints (and providers for generated-credential rules) sit directly on
// the rule object — there is no nested `inputs` wrapper at the HTTP boundary.
export const SecretValidationRuleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(SecretValidationRuleType.StaticSecrets).describe(SECRET_VALIDATION_RULES.RULE.type),
    ...staticSecretsInputsSchema.shape
  }),
  z.object({
    type: z.literal(SecretValidationRuleType.DynamicSecrets).describe(SECRET_VALIDATION_RULES.RULE.type),
    ...dynamicSecretsInputsSchema.shape
  }),
  z.object({
    type: z.literal(SecretValidationRuleType.SecretRotations).describe(SECRET_VALIDATION_RULES.RULE.type),
    ...secretRotationsInputsSchema.shape
  })
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
}).and(SecretValidationRuleSchema);
