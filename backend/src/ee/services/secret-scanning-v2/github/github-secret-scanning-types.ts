import { z } from "zod";

import { TGitHubConnection } from "@app/services/app-connection/github";

import {
  CreateGitHubDataSourceSchema,
  GitHubDataSourceListItemSchema,
  GitHubDataSourceSchema
} from "./github-secret-scanning-schemas";

export type TGitHubDataSource = z.infer<typeof GitHubDataSourceSchema>;

export type TGitHubDataSourceInput = z.infer<typeof CreateGitHubDataSourceSchema>;

export type TGitHubDataSourceListItem = z.infer<typeof GitHubDataSourceListItemSchema>;

export type TGitHubDataSourceWithConnection = TGitHubDataSource & {
  connection: TGitHubConnection;
};
