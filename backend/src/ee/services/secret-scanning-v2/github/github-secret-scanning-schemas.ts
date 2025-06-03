import { z } from "zod";

import {
  SecretScanningDataSource,
  SecretScanningResource
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  BaseCreateSecretScanningDataSourceSchema,
  BaseSecretScanningDataSourceSchema,
  BaseSecretScanningFindingSchema,
  BaseUpdateSecretScanningDataSourceSchema,
  GitRepositoryScanFindingDetailsSchema
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-schemas";
import { SecretScanningDataSources } from "@app/lib/api-docs";
import { GitHubRepositoryRegex } from "@app/lib/regex";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GitHubDataSourceConfigSchema = z.object({
  includeRepos: z
    .array(z.string().regex(GitHubRepositoryRegex, "Invalid repository name format").min(1).max(256))
    .nonempty("One or more repositories required")
    .max(25)
    .default(["*"])
    .describe(SecretScanningDataSources.CONFIG.GITHUB.includeRepos)
});

export const GitHubDataSourceSchema = BaseSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.GitHub,
  isConnectionRequired: true
})
  .extend({
    config: GitHubDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "GitHub"
    })
  );

export const CreateGitHubDataSourceSchema = BaseCreateSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.GitHub,
  isConnectionRequired: true
})
  .extend({
    config: GitHubDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "GitHub"
    })
  );

export const UpdateGitHubDataSourceSchema = BaseUpdateSecretScanningDataSourceSchema(SecretScanningDataSource.GitHub)
  .extend({
    config: GitHubDataSourceConfigSchema.optional()
  })
  .describe(
    JSON.stringify({
      title: "GitHub"
    })
  );

export const GitHubDataSourceListItemSchema = z
  .object({
    name: z.literal("GitHub"),
    connection: z.literal(AppConnection.GitHubRadar),
    type: z.literal(SecretScanningDataSource.GitHub)
  })
  .describe(
    JSON.stringify({
      title: "GitHub"
    })
  );

export const GitHubFindingSchema = BaseSecretScanningFindingSchema.extend({
  resourceType: z.literal(SecretScanningResource.Repository),
  dataSourceType: z.literal(SecretScanningDataSource.GitHub),
  details: GitRepositoryScanFindingDetailsSchema
});
