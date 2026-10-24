import { z } from "zod";

import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import { ClaudeCodeSecretDetectedAction } from "@app/hooks/api/secretScanningV2/types/claude-code-data-source";

import { BaseSecretScanningDataSourceSchema } from "./base-secret-scanning-data-source-schema";

export const ClaudeCodeDataSourceSchema = z
  .object({
    type: z.literal(SecretScanningDataSource.ClaudeCode),
    config: z.object({
      onSecretDetected: z.nativeEnum(ClaudeCodeSecretDetectedAction)
    })
  })
  .merge(BaseSecretScanningDataSourceSchema({ isConnectionRequired: false }));
