import { z } from "zod";

import { TGitHubConnection } from "@app/services/app-connection/github";

import { CreateGitHubSyncSchema, GitHubSyncListItemSchema, GitHubSyncSchema } from "./github-sync-schemas";

export type TGitHubSync = z.infer<typeof GitHubSyncSchema>;

export type TGitHubSyncInput = z.infer<typeof CreateGitHubSyncSchema>;

export type TGitHubSyncListItem = z.infer<typeof GitHubSyncListItemSchema>;

export type TGitHubSyncWithCredentials = TGitHubSync & {
  connection: TGitHubConnection;
};
