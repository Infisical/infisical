import RE2 from "re2";
import { z } from "zod";

import { SecretValidationRulesSchema } from "@app/db/schemas";
import { SecretValidationRules } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { GenericResourceNameSchema, slugSchema } from "@app/server/lib/schemas";

import {
  MAX_CONSTRAINT_AFFIX_LENGTH,
  MAX_CONSTRAINT_PATTERN_LENGTH,
  MAX_GENERATED_CONSTRAINT_LENGTH,
  MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS,
  MAX_SECRET_CONSTRAINT_LENGTH
} from "./secret-validation-rule-constants";
import { ConstraintTarget, SecretValidationRuleType } from "./secret-validation-rule-enums";
import { CONSTRAINT_TARGET_DOC_LABELS, SECRET_VALIDATION_RULE_NAME_MAP } from "./secret-validation-rule-maps";

const lengthSchema = (max: number) => z.number().int().min(1).max(max);

// A generated credential is bounded by what the generator can produce; a stored secret is not.
const maxLengthFor = (target: ConstraintTarget) =>
  target === ConstraintTarget.GeneratedPassword ? MAX_GENERATED_CONSTRAINT_LENGTH : MAX_SECRET_CONSTRAINT_LENGTH;

const regexPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_CONSTRAINT_PATTERN_LENGTH)
  .refine(
    (pattern) => {
      try {
        // eslint-disable-next-line no-new
        new RE2(pattern);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid regular expression" }
  );

const affixSchema = z.string().min(1).max(MAX_CONSTRAINT_AFFIX_LENGTH);

const ReusePreventionSchema = z
  .object({
    previousVersions: z
      .number()
      .int()
      .min(1)
      .max(MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS)
      .optional()
      .describe(SecretValidationRules.REUSE_PREVENTION.previousVersions),
    otherSecrets: z.boolean().optional().describe(SecretValidationRules.REUSE_PREVENTION.otherSecrets)
  })
  .refine((reusePrevention) => Object.values(reusePrevention).some((value) => value !== undefined), {
    message: "Set at least one reuse prevention option, or leave reusePrevention out entirely"
  });

// the constraints every target supports
export const BaseConstraintsSchema = z.object({
  minLength: lengthSchema(MAX_SECRET_CONSTRAINT_LENGTH).optional(),
  maxLength: lengthSchema(MAX_SECRET_CONSTRAINT_LENGTH).optional(),
  regexPattern: regexPatternSchema.optional(),
  requiredPrefix: affixSchema.optional(),
  requiredSuffix: affixSchema.optional()
});

const withLengthWindowCheck = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).superRefine((constraints, ctx) => {
    const { minLength, maxLength } = constraints as { minLength?: number; maxLength?: number };
    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minLength"],
        message: `Minimum length (${minLength}) cannot be greater than maximum length (${maxLength})`
      });
    }
  });

const describedConstraintFields = (target: ConstraintTarget) => {
  const docs = SecretValidationRules.CONSTRAINTS(CONSTRAINT_TARGET_DOC_LABELS[target]);
  const { regexPattern, requiredPrefix, requiredSuffix } = BaseConstraintsSchema.shape;
  const length = lengthSchema(maxLengthFor(target)).optional();

  return {
    docs,
    shape: {
      minLength: length.describe(docs.minLength),
      maxLength: length.describe(docs.maxLength),
      regexPattern: regexPattern.describe(docs.regexPattern),
      requiredPrefix: requiredPrefix.describe(docs.requiredPrefix),
      requiredSuffix: requiredSuffix.describe(docs.requiredSuffix)
    }
  };
};

// the constraint object for one target. every field is optional; a field left out is not enforced
export const buildConstraintsSchema = (target: ConstraintTarget) =>
  withLengthWindowCheck(describedConstraintFields(target).shape);

// a stored secret value can also be checked against values it has already had; a key cannot
export const buildValueConstraintsSchema = (target: ConstraintTarget) =>
  withLengthWindowCheck({
    ...describedConstraintFields(target).shape,
    reusePrevention: ReusePreventionSchema.optional().describe(SecretValidationRules.REUSE_PREVENTION.reusePrevention)
  });

export type TConstraints = z.infer<typeof BaseConstraintsSchema>;

export type TReusePrevention = { previousVersions?: number; otherSecrets?: boolean };

// a secret value additionally supports being checked against values it has already had
export type TValueConstraints = TConstraints & { reusePrevention?: TReusePrevention };

// true when at least one constraint field is set across every target on the rule
export const hasAnyConstraint = (targets: (Record<string, unknown> | null | undefined)[]) =>
  targets.some((target) => target && Object.values(target).some((value) => value !== undefined));

export const BaseSecretValidationRuleSchema = SecretValidationRulesSchema.omit({
  type: true,
  encryptedInputs: true,
  envId: true
}).extend({
  environment: z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() }).nullable()
});

export const GenericCreateSecretValidationRuleFieldsSchema = (type: SecretValidationRuleType) => {
  const docs = SecretValidationRules.CREATE(type);

  return z.object({
    name: GenericResourceNameSchema.describe(docs.name),
    projectId: z.string().trim().min(1, "Project ID required").max(36).describe(docs.projectId),
    description: z.string().trim().max(500).nullish().describe(docs.description),
    environment: slugSchema({ field: "environment", max: 64 }).optional().describe(docs.environment),
    secretPath: z
      .string()
      .trim()
      .min(1, "Secret path required")
      .max(1024)
      .transform(removeTrailingSlash)
      .describe(docs.secretPath),
    isActive: z.boolean().default(true).describe(docs.isActive)
  });
};

export const GenericUpdateSecretValidationRuleFieldsSchema = (type: SecretValidationRuleType) => {
  const docs = SecretValidationRules.UPDATE(type);

  return z.object({
    name: GenericResourceNameSchema.optional().describe(docs.name),
    description: z.string().trim().max(500).nullish().describe(docs.description),
    environment: slugSchema({ field: "environment", max: 64 }).nullish().describe(docs.environment),
    secretPath: z
      .string()
      .trim()
      .min(1, "Secret path required")
      .max(1024)
      .transform(removeTrailingSlash)
      .optional()
      .describe(docs.secretPath),
    isActive: z.boolean().optional().describe(docs.isActive)
  });
};

export const secretValidationRuleTitle = (type: SecretValidationRuleType) =>
  JSON.stringify({ title: SECRET_VALIDATION_RULE_NAME_MAP[type] });
