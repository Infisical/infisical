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
import { BasicRepositoryRegex } from "@app/lib/regex";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const BitbucketDataSourceConfigSchema = z.object({
  workspaceSlug: z
    .string()
    .min(1, "Workspace slug required")
    .max(128)
    .describe(SecretScanningDataSources.CONFIG.BITBUCKET.workspaceSlug),
  includeRepos: z
    .array(
      z
        .string()
        .min(1)
        .max(256)
        .refine((value) => value === "*" || BasicRepositoryRegex.test(value), "Invalid repository name format")
    )
    .nonempty("One or more repositories required")
    .max(100, "Cannot configure more than 100 repositories")
    .default(["*"])
    .describe(SecretScanningDataSources.CONFIG.BITBUCKET.includeRepos)
});

export const BitbucketDataSourceSchema = BaseSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.Bitbucket,
  isConnectionRequired: true
})
  .extend({
    config: BitbucketDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "Bitbucket"
    })
  );

export const CreateBitbucketDataSourceSchema = BaseCreateSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.Bitbucket,
  isConnectionRequired: true
})
  .extend({
    config: BitbucketDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "Bitbucket"
    })
  );

export const UpdateBitbucketDataSourceSchema = BaseUpdateSecretScanningDataSourceSchema(
  SecretScanningDataSource.Bitbucket
)
  .extend({
    config: BitbucketDataSourceConfigSchema.optional()
  })
  .describe(
    JSON.stringify({
      title: "Bitbucket"
    })
  );

export const BitbucketDataSourceListItemSchema = z
  .object({
    name: z.literal("Bitbucket"),
    connection: z.literal(AppConnection.Bitbucket),
    type: z.literal(SecretScanningDataSource.Bitbucket)
  })
  .describe(
    JSON.stringify({
      title: "Bitbucket"
    })
  );

export const BitbucketFindingSchema = BaseSecretScanningFindingSchema.extend({
  resourceType: z.literal(SecretScanningResource.Repository),
  dataSourceType: z.literal(SecretScanningDataSource.Bitbucket),
  details: GitRepositoryScanFindingDetailsSchema
});

export const BitbucketDataSourceCredentialsSchema = z.object({
  webhookId: z.string(),
  webhookSecret: z.string()
});
