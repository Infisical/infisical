import { z } from "zod";

import { GitHubDataSourceSchema } from "@app/ee/services/secret-scanning-v2/github";
import { GitLabDataSourceSchema } from "@app/ee/services/secret-scanning-v2/gitlab";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [
  GitHubDataSourceSchema,
  GitLabDataSourceSchema
]);
