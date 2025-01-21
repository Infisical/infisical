import { z } from "zod";

import { TGitHubConnection } from "@app/services/app-connection/github";

import { CreateGitHubSyncSchema, GitHubSyncListItemSchema, GitHubSyncSchema } from "./github-sync-schemas";

export type TGitHubSync = z.infer<typeof GitHubSyncSchema>;

export type TGitHubSyncInput = z.infer<typeof CreateGitHubSyncSchema>;

export type TGitHubSyncListItem = z.infer<typeof GitHubSyncListItemSchema>;

export type TGitHubSyncWithCredentials = TGitHubSync & {
  connection: TGitHubConnection;
};

export type TGitHubSecret = {
  name: string;
  created_at: string;
  updated_at: string;
  visibility?: "all" | "private" | "selected";
  selected_repositories_url?: string | undefined;
};

export type TGitHubPublicKey = {
  key_id: string;
  key: string;
  id?: number | undefined;
  url?: string | undefined;
  title?: string | undefined;
  created_at?: string | undefined;
};

export type TGitHubSecretPayload = {
  key_id: string;
  secret_name: string;
  encrypted_value: string;
};
