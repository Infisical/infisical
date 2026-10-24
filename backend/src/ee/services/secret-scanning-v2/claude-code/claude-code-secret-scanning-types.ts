import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

import {
  ClaudeCodeDataSourceListItemSchema,
  ClaudeCodeDataSourceSchema,
  ClaudeCodeFindingSchema,
  CreateClaudeCodeDataSourceSchema,
  SubmitClaudeCodePromptSchema
} from "./claude-code-secret-scanning-schemas";

export type TClaudeCodeDataSource = z.infer<typeof ClaudeCodeDataSourceSchema>;

export type TClaudeCodeDataSourceInput = z.infer<typeof CreateClaudeCodeDataSourceSchema>;

export type TClaudeCodeDataSourceListItem = z.infer<typeof ClaudeCodeDataSourceListItemSchema>;

export type TClaudeCodeFinding = z.infer<typeof ClaudeCodeFindingSchema>;

export type TClaudeCodeDataSourceWithConnection = TClaudeCodeDataSource & {
  connection: null;
};

export type TSubmitClaudeCodePromptDTO = z.infer<typeof SubmitClaudeCodePromptSchema> & {
  dataSourceId: string;
  // who submitted the prompt; each submitter gets their own resource
  submitter: {
    id: string;
    name: string;
    email?: string;
  };
};

export type TClaudeCodePromptSubmission = {
  dataSourceId: string;
  submitter: TSubmitClaudeCodePromptDTO["submitter"];
  // base64 KMS ciphertext; the prompt holds secrets and the job payload is stored in the queue
  encryptedPrompt: string;
  // already recorded in the project, so the scan doesn't add them again under this submitter
  excludedFingerprints: string[];
  sessionId?: string;
  cwd?: string;
  submittedAt: string;
};

export type TQueueClaudeCodeResourceDiffScan = {
  dataSourceType: SecretScanningDataSource.ClaudeCode;
  payload: TClaudeCodePromptSubmission;
  dataSourceId: string;
  resourceId: string;
  scanId: string;
};
