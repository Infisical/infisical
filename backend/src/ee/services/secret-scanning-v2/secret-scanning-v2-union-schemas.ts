import { z } from "zod";

import { BitBucketDataSourceSchema, BitBucketFindingSchema } from "@app/ee/services/secret-scanning-v2/bitbucket";
import { GitHubDataSourceSchema, GitHubFindingSchema } from "@app/ee/services/secret-scanning-v2/github";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [
  GitHubDataSourceSchema,
  BitBucketDataSourceSchema
]);

export const SecretScanningFindingSchema = z.discriminatedUnion("dataSourceType", [
  GitHubFindingSchema,
  BitBucketFindingSchema
]);
