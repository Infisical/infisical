import { z } from "zod";

import { BitBucketDataSourceSchema } from "./bitbucket-data-source-schema";
import { GitHubDataSourceSchema } from "./github-data-source-schema";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [
  GitHubDataSourceSchema,
  BitBucketDataSourceSchema
]);

export type TSecretScanningDataSourceForm = z.infer<typeof SecretScanningDataSourceSchema>;
