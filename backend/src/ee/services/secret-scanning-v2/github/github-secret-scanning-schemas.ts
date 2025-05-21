import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  BaseCreateSecretScanningDataSourceSchema,
  BaseSecretScanningDataSourceSchema,
  BaseUpdateSecretScanningDataSourceSchema
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GitHubDataSourceConfigSchema = z.object({
  includeRepos: z.array(z.string()).nonempty("One or more repositories required").default(["*"])
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
    connection: z.literal(AppConnection.GitHub),
    type: z.literal(SecretScanningDataSource.GitHub)
  })
  .describe(
    JSON.stringify({
      title: "GitHub"
    })
  );
