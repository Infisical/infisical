import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  BaseCreateSecretScanningDataSourceSchema,
  BaseSecretScanningDataSourceSchema,
  BaseUpdateSecretScanningDataSourceSchema
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GitLabDataSourceConfigSchema = z.object({
  includeProjects: z.array(z.string()).nonempty("One or more projects required").default(["*"])
});

export const GitLabDataSourceSchema = BaseSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.GitLab,
  isConnectionRequired: true
})
  .extend({
    config: GitLabDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );

export const CreateGitLabDataSourceSchema = BaseCreateSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.GitLab,
  isConnectionRequired: true
})
  .extend({
    config: GitLabDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );

export const UpdateGitLabDataSourceSchema = BaseUpdateSecretScanningDataSourceSchema(SecretScanningDataSource.GitLab)
  .extend({
    config: GitLabDataSourceConfigSchema.optional()
  })
  .describe(
    JSON.stringify({
      title: "GitLab"
    })
  );

export const GitLabDataSourceListItemSchema = z
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
