import { z } from "zod";

import { GitHubDataSourceSchema, GitHubFindingSchema } from "@app/ee/services/secret-scanning-v2/github";
import { GitLabDataSourceSchema, GitLabFindingSchema } from "@app/ee/services/secret-scanning-v2/gitlab";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [
  GitHubDataSourceSchema,
  GitLabDataSourceSchema
]);

export const SecretScanningFindingSchema = z.discriminatedUnion("resourceType", [
  GitHubFindingSchema,
  GitLabFindingSchema
]);
