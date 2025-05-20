import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  BaseCreateSecretScanningDataSourceSchema,
  BaseSecretScanningDataSourceSchema,
  BaseUpdateSecretScanningDataSourceSchema
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GitLabSecretScanningDataSourceConfigSchema = z.object({
  includeProjects: z.array(z.string()).default(["*"])
});

export const GitLabSecretScanningDataSourceSchema = BaseSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.GitLab,
  isConnectionRequired: true
})
  .extend({
    config: GitLabSecretScanningDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );

export const CreateGitLabSecretScanningDataSourceSchema = BaseCreateSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.GitLab,
  isConnectionRequired: true
})
  .extend({
    config: GitLabSecretScanningDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );

export const UpdateGitLabSecretScanningDataSourceSchema = BaseUpdateSecretScanningDataSourceSchema(
  SecretScanningDataSource.GitLab
)
  .extend({
    config: GitLabSecretScanningDataSourceConfigSchema.optional()
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );

export const GitLabSecretScanningDataSourceListItemSchema = z
  .object({
    name: z.literal("GitLab"),
    connection: z.literal(AppConnection.GitLab),
    type: z.literal(SecretScanningDataSource.GitLab)
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );
