import { z } from "zod";

import { SecretValidationRulesSchema } from "@app/db/schemas";

import {
  ConstraintTarget,
  ConstraintType,
  SecretValidationRuleType,
  TSecretValidationRuleInputs
} from "./secret-validation-rule-types";

export const constraintSchema = z.object({
  type: z.nativeEnum(ConstraintType),
  appliesTo: z.nativeEnum(ConstraintTarget),
  value: z.string().min(1)
});

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
  inputs: true
}).and(SecretValidationRuleInputSchema);
