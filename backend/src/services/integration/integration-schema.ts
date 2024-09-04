import { z } from "zod";

import { INTEGRATION } from "@app/lib/api-docs";

import { IntegrationMappingBehavior } from "../integration-auth/integration-list";

export const IntegrationMetadataSchema = z.object({
  initialSyncBehavior: z.string().optional().describe(INTEGRATION.CREATE.metadata.initialSyncBehavoir),

  secretPrefix: z.string().optional().describe(INTEGRATION.CREATE.metadata.secretPrefix),
  secretSuffix: z.string().optional().describe(INTEGRATION.CREATE.metadata.secretSuffix),

  mappingBehavior: z
    .nativeEnum(IntegrationMappingBehavior)
    .optional()
    .describe(INTEGRATION.CREATE.metadata.mappingBehavior),

  shouldAutoRedeploy: z.boolean().optional().describe(INTEGRATION.CREATE.metadata.shouldAutoRedeploy),

  secretGCPLabel: z
    .object({
      labelName: z.string(),
      labelValue: z.string()
    })
    .optional()
    .describe(INTEGRATION.CREATE.metadata.secretGCPLabel),

  secretAWSTag: z
    .array(
      z.object({
        key: z.string(),
        value: z.string()
      })
    )
    .optional()
    .describe(INTEGRATION.CREATE.metadata.secretAWSTag),

  githubVisibility: z
    .union([z.literal("selected"), z.literal("private"), z.literal("all")])
    .optional()
    .describe(INTEGRATION.CREATE.metadata.githubVisibility),
  githubVisibilityRepoIds: z.array(z.string()).optional().describe(INTEGRATION.CREATE.metadata.githubVisibilityRepoIds),

  kmsKeyId: z.string().optional().describe(INTEGRATION.CREATE.metadata.kmsKeyId),

  shouldDisableDelete: z.boolean().optional().describe(INTEGRATION.CREATE.metadata.shouldDisableDelete),
  shouldEnableDelete: z.boolean().optional().describe(INTEGRATION.CREATE.metadata.shouldEnableDelete),
  shouldMaskSecrets: z.boolean().optional().describe(INTEGRATION.CREATE.metadata.shouldMaskSecrets),
  shouldProtectSecrets: z.boolean().optional().describe(INTEGRATION.CREATE.metadata.shouldProtectSecrets)
});
