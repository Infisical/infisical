import { z } from "zod";

import { APPROVAL_POLICY_AUTO_APPROVAL as DOCS } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { AutoApprovalConstraintValue } from "./auto-approval-types";

const IdentifierSchema = slugSchema({ field: "Identifier" });

const ConditionValueSchema = z.string().trim().min(1, "Values cannot be empty").max(255);

export const AutoApprovalConfigSchema = z
  .object({
    inputs: z
      .object({
        connectionId: z.string().uuid().describe(DOCS.inputConnectionId),
        subject: IdentifierSchema.describe(DOCS.inputSubject)
      })
      .array()
      .max(10, "A policy can have at most 10 request form fields")
      .describe(DOCS.inputs),
    rules: z
      .object({
        name: z.string().trim().min(1, "Rule name is required").max(128).describe(DOCS.ruleName),
        conditions: z
          .object({
            connectionId: z.string().uuid().describe(DOCS.conditionConnectionId),
            subject: IdentifierSchema.describe(DOCS.conditionSubject),
            constraint: IdentifierSchema.describe(DOCS.constraint),
            values: ConditionValueSchema.array().max(50).describe(DOCS.values)
          })
          .array()
          .min(1, "A rule needs at least one condition, or it would approve every request")
          .max(20, "A rule can have at most 20 conditions")
          .describe(DOCS.conditions)
      })
      .array()
      .max(20, "A policy can have at most 20 auto-approval rules")
      .describe(DOCS.rules)
  })
  .describe(DOCS.autoApproval);

export const AutoApprovalConfigResponseSchema = z.object({
  inputs: z
    .object({
      id: z.string().uuid(),
      connectionId: z.string().uuid(),
      subject: z.string()
    })
    .array(),
  rules: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      conditions: z
        .object({
          id: z.string().uuid(),
          connectionId: z.string().uuid(),
          subject: z.string(),
          constraint: z.string(),
          values: z.string().array()
        })
        .array()
    })
    .array()
});

export const AutoApprovalInputValuesSchema = z
  .object({
    connectionId: z.string().uuid().describe(DOCS.inputConnectionId),
    subject: IdentifierSchema.describe(DOCS.inputSubject),
    value: z.string().trim().max(2048).describe(DOCS.requestInputValue)
  })
  .array()
  .max(10)
  .describe(DOCS.requestInputs);

export const AutoApprovalOutcomeSchema = z
  .object({
    approvedAt: z.date().nullable(),
    approvedByRuleId: z.string().nullable(),
    inputs: z.object({ label: z.string(), value: z.string(), url: z.string().nullable() }).array(),
    rules: z
      .object({
        id: z.string(),
        name: z.string(),
        passed: z.boolean(),
        conditions: z
          .object({
            id: z.string(),
            description: z.string(),
            passed: z.boolean(),
            reason: z.string().nullable()
          })
          .array()
      })
      .array()
  })
  .nullable()
  .describe(DOCS.outcome);

export const AutoApprovalInputDetailsSchema = z.object({
  connectionId: z.string().uuid(),
  connectionName: z.string(),
  subject: z.string(),
  label: z.string(),
  placeholder: z.string()
});

export const AutoApprovalCatalogSchema = z.object({
  apps: z.nativeEnum(AppConnection).array(),
  connections: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      app: z.string(),
      subjects: z
        .object({
          id: z.string(),
          label: z.string(),
          input: z.object({ label: z.string(), placeholder: z.string() }).nullable(),
          constraints: z
            .object({
              id: z.string(),
              label: z.string(),
              value: z.nativeEnum(AutoApprovalConstraintValue),
              hasOptions: z.boolean()
            })
            .array()
        })
        .array()
    })
    .array()
});

const MAX_SIBLINGS_LENGTH = 4096;

export const AutoApprovalSiblingsSchema = z
  .string()
  .max(MAX_SIBLINGS_LENGTH)
  .optional()
  .transform((raw, ctx) => {
    if (!raw) return {} as Record<string, string[]>;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "siblings must be a JSON object" });
      return z.NEVER;
    }

    const result = z.record(IdentifierSchema, ConditionValueSchema.array().max(50)).safeParse(parsed);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "siblings must map each constraint to a list of values"
      });
      return z.NEVER;
    }
    return result.data;
  })
  .describe(DOCS.optionsSiblings);
