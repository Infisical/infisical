import { z } from "zod";

import { BitbucketDataSourceSchema, BitbucketFindingSchema } from "@app/ee/services/secret-scanning-v2/bitbucket";
import { GitHubDataSourceSchema, GitHubFindingSchema } from "@app/ee/services/secret-scanning-v2/github";
import { GitLabDataSourceSchema, GitLabFindingSchema } from "@app/ee/services/secret-scanning-v2/gitlab";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [
  GitHubDataSourceSchema,
  BitbucketDataSourceSchema,
  GitLabDataSourceSchema
]);

export const SecretScanningFindingSchema = z.discriminatedUnion("dataSourceType", [
  GitHubFindingSchema.describe(
    JSON.stringify({
      title: "GitHub"
    })
  ),
  BitbucketFindingSchema.describe(
    JSON.stringify({
      title: "Bitbucket"
    })
  ),
  GitLabFindingSchema.describe(
    JSON.stringify({
      title: "GitLab"
    })
  )
]);
