import { z } from "zod";

import { TGitLabConnection } from "@app/services/app-connection/gitlab";

import {
  CreateGitLabSecretScanningDataSourceSchema,
  GitLabSecretScanningDataSourceListItemSchema,
  GitLabSecretScanningDataSourceSchema
} from "./gitlab-secret-scanning-schemas";

export type TGitLabSecretScanningDataSource = z.infer<typeof GitLabSecretScanningDataSourceSchema>;

export type TGitLabSecretScanningDataSourceInput = z.infer<typeof CreateGitLabSecretScanningDataSourceSchema>;

export type TGitLabSecretScanningDataSourceListItem = z.infer<typeof GitLabSecretScanningDataSourceListItemSchema>;

export type TGitLabSecretScanningDataSourceWithConnection = TGitLabSecretScanningDataSource & {
  connection: TGitLabConnection;
};
