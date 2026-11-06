import { z } from "zod";

import { BitbucketDataSourceSchema } from "./bitbucket-data-source-schema";
import { ClaudeCodeDataSourceSchema } from "./claude-code-data-source-schema";
import { GitHubDataSourceSchema } from "./github-data-source-schema";
import { GitLabDataSourceSchema } from "./gitlab-data-source-schema";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [
  GitHubDataSourceSchema,
  BitbucketDataSourceSchema,
  GitLabDataSourceSchema,
  ClaudeCodeDataSourceSchema
]);

export type TSecretScanningDataSourceForm = z.infer<typeof SecretScanningDataSourceSchema>;
