import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  BaseCreateSecretScanningDataSourceSchema,
  BaseSecretScanningDataSourceSchema,
  BaseUpdateSecretScanningDataSourceSchema
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GitHubSecretScanningDataSourceConfigSchema = z.object({
  includeRepos: z.array(z.string()).default(["*"])
});

export const GitHubSecretScanningDataSourceSchema = BaseSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.GitHub,
  isConnectionRequired: true
})
  .extend({
    config: GitHubSecretScanningDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "GitHub"
    })
  );

export const CreateGitHubSecretScanningDataSourceSchema = BaseCreateSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.GitHub,
  isConnectionRequired: true
})
  .extend({
    config: GitHubSecretScanningDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "GitHub"
    })
  );

export const UpdateGitHubSecretScanningDataSourceSchema = BaseUpdateSecretScanningDataSourceSchema(
  SecretScanningDataSource.GitHub
)
  .extend({
    config: GitHubSecretScanningDataSourceConfigSchema.optional()
  })
  .describe(
    JSON.stringify({
      title: "GitHub"
    })
  );

export const GitHubSecretScanningDataSourceListItemSchema = z
  .object({
    name: z.literal("GitHub"),
    connection: z.literal(AppConnection.GitHub),
    type: z.literal(SecretScanningDataSource.GitHub)
  })
  .describe(
    JSON.stringify({
      title: "GitHub"
    })
  );
