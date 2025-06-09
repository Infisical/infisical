import { z } from "zod";

import { GitHubDataSourceSchema } from "./github-data-source-schema";

export const SecretScanningDataSourceSchema = z.discriminatedUnion("type", [
  GitHubDataSourceSchema
]);

export type TSecretScanningDataSourceForm = z.infer<typeof SecretScanningDataSourceSchema>;
