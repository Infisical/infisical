import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  BaseCreateSecretScanningDataSourceSchema,
  BaseSecretScanningDataSourceSchema,
  BaseSecretScanningFindingSchema,
  BaseUpdateSecretScanningDataSourceSchema
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-schemas";
import { SecretScanningDataSources } from "@app/lib/api-docs";

import {
  CLAUDE_CODE_MAX_PROMPT_LENGTH,
  CLAUDE_CODE_MAX_SECRET_LENGTH,
  CLAUDE_CODE_MAX_SECRETS
} from "./claude-code-secret-scanning-constants";
import { ClaudeCodeSecretDetectedAction, ClaudeCodeSecretStatus } from "./claude-code-secret-scanning-enums";

// Prompts are pushed by the Claude Code plugin, so there is nothing to configure and no scan settings apply.
const OMITTED_SCAN_SETTINGS = {
  isAutoScanEnabled: true,
  isHistoricalScanEnabled: true,
  isScanNewCommitsEnabled: true,
  isDiscoveryEnabled: true
} as const;

// Data sources created before this setting have no value for it, so the default keeps them blocking.
export const ClaudeCodeDataSourceConfigSchema = z.object({
  onSecretDetected: z
    .nativeEnum(ClaudeCodeSecretDetectedAction)
    .default(ClaudeCodeSecretDetectedAction.Block)
    .describe(SecretScanningDataSources.CONFIG.CLAUDE_CODE.onSecretDetected)
});

export const ClaudeCodeDataSourceSchema = BaseSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.ClaudeCode,
  isConnectionRequired: false
})
  .extend({
    config: ClaudeCodeDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "Claude Code"
    })
  );

export const CreateClaudeCodeDataSourceSchema = BaseCreateSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.ClaudeCode,
  isConnectionRequired: false
})
  .omit(OMITTED_SCAN_SETTINGS)
  .extend({
    config: ClaudeCodeDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "Claude Code"
    })
  );

export const UpdateClaudeCodeDataSourceSchema = BaseUpdateSecretScanningDataSourceSchema(
  SecretScanningDataSource.ClaudeCode
)
  .omit(OMITTED_SCAN_SETTINGS)
  .extend({
    config: ClaudeCodeDataSourceConfigSchema.optional()
  })
  .describe(
    JSON.stringify({
      title: "Claude Code"
    })
  );

export const ClaudeCodeDataSourceListItemSchema = z
  .object({
    name: z.literal("Claude Code"),
    connection: z.null(),
    type: z.literal(SecretScanningDataSource.ClaudeCode)
  })
  .describe(
    JSON.stringify({
      title: "Claude Code"
    })
  );

export const ClaudeCodeFindingDetailsSchema = z.object({
  description: z.string(),
  ruleID: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  startColumn: z.number(),
  endColumn: z.number(),
  entropy: z.number(),
  author: z.string(),
  email: z.string(),
  date: z.string(),
  fingerprint: z.string(),
  sessionId: z.string().optional(),
  cwd: z.string().optional()
});

export const ClaudeCodeFindingSchema = BaseSecretScanningFindingSchema.extend({
  dataSourceType: z.literal(SecretScanningDataSource.ClaudeCode),
  details: ClaudeCodeFindingDetailsSchema
});

const ClaudeCodeSecretSchema = z.object({
  // not trimmed: whitespace can be part of a secret, and the value must match what the scan extracts
  value: z
    .string()
    .min(1)
    .max(CLAUDE_CODE_MAX_SECRET_LENGTH)
    .describe(SecretScanningDataSources.CLAUDE_CODE.SECRET.value),
  ruleId: z.string().trim().min(1).max(128).describe(SecretScanningDataSources.CLAUDE_CODE.SECRET.ruleId)
});

const ClaudeCodeSecretsSchema = ClaudeCodeSecretSchema.array()
  .min(1, "At least one secret required")
  .max(CLAUDE_CODE_MAX_SECRETS)
  .describe(SecretScanningDataSources.CLAUDE_CODE.SECRET.secrets);

export const CheckClaudeCodeSecretsSchema = z.object({
  secrets: ClaudeCodeSecretsSchema
});

export const ClaudeCodeSecretCheckResultSchema = z.object({
  ruleId: z.string(),
  status: z.nativeEnum(ClaudeCodeSecretStatus)
});

export const SubmitClaudeCodePromptSchema = z.object({
  prompt: z
    .string()
    .min(1, "Prompt required")
    .max(CLAUDE_CODE_MAX_PROMPT_LENGTH)
    .describe(SecretScanningDataSources.CLAUDE_CODE.SUBMIT_PROMPT.prompt),
  secrets: ClaudeCodeSecretsSchema,
  sessionId: z
    .string()
    .trim()
    .max(256)
    .optional()
    .describe(SecretScanningDataSources.CLAUDE_CODE.SUBMIT_PROMPT.sessionId),
  cwd: z.string().trim().max(4096).optional().describe(SecretScanningDataSources.CLAUDE_CODE.SUBMIT_PROMPT.cwd)
});
