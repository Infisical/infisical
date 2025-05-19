import { z } from "zod";

import { GitHubSecretScanningDataSourceSchema } from "@app/ee/services/secret-scanning-v2/github";
import { GitLabSecretScanningDataSourceSchema } from "@app/ee/services/secret-scanning-v2/gitlab";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [
  GitHubSecretScanningDataSourceSchema,
  GitLabSecretScanningDataSourceSchema
]);
