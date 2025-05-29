import { z } from "zod";

import { GitHubDataSourceSchema, GitHubFindingSchema } from "@app/ee/services/secret-scanning-v2/github";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [GitHubDataSourceSchema]);

export const SecretScanningFindingSchema = z.discriminatedUnion("resourceType", [GitHubFindingSchema]);
