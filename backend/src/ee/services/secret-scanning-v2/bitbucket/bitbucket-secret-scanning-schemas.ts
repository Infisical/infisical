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

export const BitBucketDataSourceConfigSchema = z.object({
  includeRepos: z
    .array(
      z
        .string()
        .min(1)
        .max(256)
        .refine((value) => value === "*" || GitHubRepositoryRegex.test(value), "Invalid repository name format")
    )
    .nonempty("One or more repositories required")
    .max(100, "Cannot configure more than 100 repositories")
    .default(["*"])
    .describe(SecretScanningDataSources.CONFIG.BITBUCKET.includeRepos)
});

export const BitBucketDataSourceSchema = BaseSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.BitBucket,
  isConnectionRequired: true
})
  .extend({
    config: BitBucketDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "BitBucket"
    })
  );

export const CreateBitBucketDataSourceSchema = BaseCreateSecretScanningDataSourceSchema({
  type: SecretScanningDataSource.BitBucket,
  isConnectionRequired: true
})
  .extend({
    config: BitBucketDataSourceConfigSchema
  })
  .describe(
    JSON.stringify({
      title: "BitBucket"
    })
  );

export const UpdateBitBucketDataSourceSchema = BaseUpdateSecretScanningDataSourceSchema(
  SecretScanningDataSource.BitBucket
)
  .extend({
    config: BitBucketDataSourceConfigSchema.optional()
  })
  .describe(
    JSON.stringify({
      title: "BitBucket"
    })
  );

export const BitBucketDataSourceListItemSchema = z
  .object({
    name: z.literal("BitBucket"),
    connection: z.literal(AppConnection.BitBucket),
    type: z.literal(SecretScanningDataSource.BitBucket)
  })
  .describe(
    JSON.stringify({
      title: "BitBucket"
    })
  );

export const BitBucketFindingSchema = BaseSecretScanningFindingSchema.extend({
  resourceType: z.literal(SecretScanningResource.Repository),
  dataSourceType: z.literal(SecretScanningDataSource.BitBucket),
  details: GitRepositoryScanFindingDetailsSchema
});
