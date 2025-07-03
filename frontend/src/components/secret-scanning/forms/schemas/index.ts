import { z } from "zod";

import { BitbucketDataSourceSchema } from "./bitbucket-data-source-schema";
import { GitHubDataSourceSchema } from "./github-data-source-schema";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [
  GitHubDataSourceSchema,
  BitbucketDataSourceSchema
]);

export type TSecretScanningDataSourceForm = z.infer<typeof SecretScanningDataSourceSchema>;
