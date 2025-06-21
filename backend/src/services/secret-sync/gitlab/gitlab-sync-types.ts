import { z } from "zod";

import { TGitLabConnection } from "@app/services/app-connection/gitlab";

import { CreateGitLabSyncSchema, GitLabSyncListItemSchema, GitLabSyncSchema } from "./gitlab-sync-schemas";

export type TGitLabSync = z.infer<typeof GitLabSyncSchema>;
export type TGitLabSyncInput = z.infer<typeof CreateGitLabSyncSchema>;
export type TGitLabSyncListItem = z.infer<typeof GitLabSyncListItemSchema>;

export type TGitLabSyncWithCredentials = TGitLabSync & {
  connection: TGitLabConnection;
};

// GitLab CI/CD Variable structure based on API documentation
export type TGitLabVariable = {
  key: string;
  value: string;
  variable_type: "env_var" | "file";
  protected: boolean;
  masked: boolean;
  hidden: boolean;
  raw: boolean;
  environment_scope: string;
  description: string | null;
};

// Type for creating a new variable
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

// Type for updating an existing variable
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
