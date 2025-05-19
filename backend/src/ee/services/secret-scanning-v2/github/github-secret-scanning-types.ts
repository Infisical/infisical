import { z } from "zod";

import { TGitHubConnection } from "@app/services/app-connection/github";

import {
  CreateGitHubSecretScanningDataSourceSchema,
  GitHubSecretScanningDataSourceListItemSchema,
  GitHubSecretScanningDataSourceSchema
} from "./github-secret-scanning-schemas";

export type TGitHubSecretScanningDataSource = z.infer<typeof GitHubSecretScanningDataSourceSchema>;

export type TGitHubSecretScanningDataSourceInput = z.infer<typeof CreateGitHubSecretScanningDataSourceSchema>;

export type TGitHubSecretScanningDataSourceListItem = z.infer<typeof GitHubSecretScanningDataSourceListItemSchema>;

export type TGitHubSecretScanningDataSourceWithConnection = TGitHubSecretScanningDataSource & {
  connection: TGitHubConnection;
};
