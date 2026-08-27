import { z } from "zod";

import { SecretValidationRulesSchema } from "@app/db/schemas";
import { SECRET_VALIDATION_RULES } from "@app/lib/api-docs";

import {
  ConstraintTarget,
  ConstraintType,
  DynamicSecretRuleProvider,
  SecretRotationRuleProvider,
  SecretValidationRuleType,
  TConstraint,
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
const STATIC_STRING_CONSTRAINT_TYPES = [...GENERATED_CONSTRAINT_TYPES] as const;

/** Embed description + example so Mintlify/OpenAPI curl samples include enum fields. */
const openApiField = (description: string, example: string) => JSON.stringify({ description, example });

const SECRET_VALUE_ONLY_CONSTRAINTS: ConstraintType[] = [ConstraintType.UniqueSecretValue];

const valueRequiredRefinement = (c: TConstraint) => {
  if (c.type === ConstraintType.UniqueSecretValue) return true;
  return SECRET_VALUE_ONLY_CONSTRAINTS.includes(c.type) || c.value.length > 0;
};

const preventValueReuseTargetRefinement = (c: TConstraint) =>
  !SECRET_VALUE_ONLY_CONSTRAINTS.includes(c.type) || c.appliesTo === ConstraintTarget.SecretValue;

const withConstraintRefinements = <T extends z.ZodType<TConstraint>>(schema: T) =>
  schema
    .refine(valueRequiredRefinement, { message: "Value is required", path: ["value"] })
    .refine(preventValueReuseTargetRefinement, {
      message: "This constraint type can only apply to secret values",
      path: ["appliesTo"]
    });

const uniqueSecretValueConstraintSchema = z.object({
  type: z.literal(ConstraintType.UniqueSecretValue),
  appliesTo: z
    .enum(STATIC_RULE_TARGETS)
    .describe(openApiField(SECRET_VALIDATION_RULES.RULE.appliesToStatic, ConstraintTarget.SecretValue)),
  value: z
    .object({
      secretVersions: z.object({
        enabled: z.boolean(),
        versions: z.number().int().min(1).max(MAX_PREVENT_VALUE_REUSE_VERSIONS)
      }),
      otherSecrets: z.object({
        enabled: z.boolean()
      })
    })
    .refine((v) => v.secretVersions.enabled || v.otherSecrets.enabled, {
      message: "At least one uniqueness check must be enabled (version history or other secrets)"
    })
});

const staticStringConstraintSchema = z.object({
  type: z
    .enum(STATIC_STRING_CONSTRAINT_TYPES)
    .describe(openApiField(SECRET_VALIDATION_RULES.RULE.constraintTypeStatic, ConstraintType.MinLength)),
  appliesTo: z
    .enum(STATIC_RULE_TARGETS)
    .describe(openApiField(SECRET_VALIDATION_RULES.RULE.appliesToStatic, ConstraintTarget.SecretValue)),
  value: z.string().describe(openApiField(SECRET_VALIDATION_RULES.RULE.constraintValue, "8"))
});

const generatedConstraintSchema = z.object({
  type: z
    .enum(GENERATED_CONSTRAINT_TYPES)
    .describe(openApiField(SECRET_VALIDATION_RULES.RULE.constraintTypeGenerated, ConstraintType.MinLength)),
  appliesTo: z
    .enum(GENERATED_RULE_TARGETS)
    .describe(openApiField(SECRET_VALIDATION_RULES.RULE.appliesToGenerated, ConstraintTarget.GeneratedPassword)),
  value: z.string().describe(openApiField(SECRET_VALIDATION_RULES.RULE.constraintValue, "8"))
});

// Plain constraint schemas (no refinements) so the OpenAPI spec generator can
// introspect the concrete object shapes. Business-rule refinements are applied
// separately in the validated input schemas used by parseSecretValidationRuleInputs.
const buildConstraintSchemaForRuleType = (ruleType: SecretValidationRuleType) => {
  if (ruleType === SecretValidationRuleType.StaticSecrets) {
    return z.union([staticStringConstraintSchema, uniqueSecretValueConstraintSchema]);
  }
  return generatedConstraintSchema;
};

// Refined constraint schemas for runtime validation (service layer).
const buildValidatedConstraintSchemaForRuleType = (ruleType: SecretValidationRuleType) =>
  withConstraintRefinements(buildConstraintSchemaForRuleType(ruleType));

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

// Validated input schemas for runtime parsing (service layer). These carry the
// business-rule refinements that the plain schemas above intentionally omit so
// the OpenAPI spec generator can introspect the concrete constraint shapes.
const validatedInputsSchemaMap: Record<SecretValidationRuleType, z.ZodSchema<TSecretValidationRuleInputs>> = {
  [SecretValidationRuleType.StaticSecrets]: z.object({
    constraints: z.array(buildValidatedConstraintSchemaForRuleType(SecretValidationRuleType.StaticSecrets)).min(1)
  }),
  [SecretValidationRuleType.DynamicSecrets]: z.object({
    providers: z.array(z.nativeEnum(DynamicSecretRuleProvider)).min(1, "Select at least one provider"),
    constraints: z.array(buildValidatedConstraintSchemaForRuleType(SecretValidationRuleType.DynamicSecrets)).min(1)
  }),
  [SecretValidationRuleType.SecretRotations]: z.object({
    providers: z.array(z.nativeEnum(SecretRotationRuleProvider)).min(1, "Select at least one provider"),
    constraints: z.array(buildValidatedConstraintSchemaForRuleType(SecretValidationRuleType.SecretRotations)).min(1)
  })
};

export const parseSecretValidationRuleInputs = (type: string, inputs: unknown) => {
  const schema = validatedInputsSchemaMap[type as SecretValidationRuleType];
  if (!schema) {
    throw new Error(`Unknown secret validation rule type: ${type}`);
  }
  return schema.parse(inputs);
};

export const SecretValidationRuleResponseSchema = SecretValidationRulesSchema.omit({
  type: true,
  encryptedInputs: true
}).and(SecretValidationRuleSchema);
