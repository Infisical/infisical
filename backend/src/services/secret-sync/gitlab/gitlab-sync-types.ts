import { z } from "zod";

import { TGitLabConnection } from "@app/services/app-connection/gitlab";

import { CreateGitLabSyncSchema, GitLabSyncListItemSchema, GitLabSyncSchema } from "./gitlab-sync-schemas";

export type TGitLabSync = z.infer<typeof GitLabSyncSchema>;
export type TGitLabSyncInput = z.infer<typeof CreateGitLabSyncSchema>;
export type TGitLabSyncListItem = z.infer<typeof GitLabSyncListItemSchema>;

export type TGitLabSyncWithCredentials = TGitLabSync & {
  connection: TGitLabConnection;
};

export type TGitLabVariable = {
  key: string;
  value: string;
  protected: boolean;
  masked: boolean;
  environmentScope?: string;
  hidden?: boolean;
};

export type TGitLabVariableCreate = {
  key: string;
  value: string;
  variable_type?: "env_var" | "file";
  protected?: boolean;
  masked?: boolean;
  raw?: boolean;
  environment_scope?: string;
  description?: string;
};

export type TGitLabVariableUpdate = {
  value: string;
  variable_type?: "env_var" | "file";
  protected?: boolean;
  masked?: boolean;
  raw?: boolean;
  environment_scope?: string;
  description?: string | null;
};

export type TGitLabListVariables = {
  accessToken: string;
  projectId: string;
  environmentScope?: string;
};

export type TGitLabCreateVariable = TGitLabListVariables & {
  variable: TGitLabVariableCreate;
};

export type TGitLabUpdateVariable = TGitLabListVariables & {
  key: string;
  variable: TGitLabVariableUpdate;
};
