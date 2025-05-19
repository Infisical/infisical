import { z } from "zod";

import { GitHubDataSourceSchema } from "./github-data-source-schema";
import { GitLabDataSourceSchema } from "./gitlab-data-source-schema";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [
  GitLabDataSourceSchema,
  GitHubDataSourceSchema
]);

export type TSecretScanningDataSourceForm = z.infer<typeof SecretScanningDataSourceSchema>;
