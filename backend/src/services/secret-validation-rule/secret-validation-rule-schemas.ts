import { z } from "zod";

import { SecretValidationRulesSchema } from "@app/db/schemas";

import {
  ConstraintTarget,
  ConstraintType,
  SecretValidationRuleType,
  TSecretValidationRuleInputs
} from "./secret-validation-rule-types";

export const MAX_PREVENT_VALUE_REUSE_VERSIONS = 25;

export const constraintSchema = z
  .object({
    type: z.nativeEnum(ConstraintType),
    appliesTo: z.nativeEnum(ConstraintTarget),
    value: z.string()
  })
  .refine((c) => c.type === ConstraintType.PreventValueReuse || c.value.length > 0, {
    message: "Value is required",
    path: ["value"]
  })
  .refine((c) => c.type !== ConstraintType.PreventValueReuse || c.appliesTo === ConstraintTarget.SecretValue, {
    message: "No value reuse constraint can only apply to secret values",
    path: ["appliesTo"]
  })
  .refine(
    (c) => {
      if (c.type !== ConstraintType.PreventValueReuse) return true;
      const num = Number(c.value);
      return Number.isInteger(num) && num >= 1 && num <= MAX_PREVENT_VALUE_REUSE_VERSIONS;
    },
    {
      message: `Prevent value reuse version count must be between 1 and ${MAX_PREVENT_VALUE_REUSE_VERSIONS}`,
      path: ["value"]
    }
  );

export const staticSecretsInputsSchema = z.object({
  constraints: z.array(constraintSchema).min(1)
});

// Discriminated union for create/update request bodies
export const SecretValidationRuleInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(SecretValidationRuleType.StaticSecrets), inputs: staticSecretsInputsSchema })
]);

// Map of type → inputs schema, used for runtime parsing
const inputsSchemaMap: Record<SecretValidationRuleType, z.ZodSchema<TSecretValidationRuleInputs>> = {
  [SecretValidationRuleType.StaticSecrets]: staticSecretsInputsSchema
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
