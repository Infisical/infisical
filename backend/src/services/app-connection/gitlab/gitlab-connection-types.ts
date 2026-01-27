import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateGitLabConnectionSchema,
  GitLabConnectionSchema,
  ValidateGitLabConnectionCredentialsSchema
} from "./gitlab-connection-schemas";

export type TGitLabConnection = z.infer<typeof GitLabConnectionSchema>;

export type TGitLabConnectionInput = z.infer<typeof CreateGitLabConnectionSchema> & {
  app: AppConnection.GitLab;
};

export type TValidateGitLabConnectionCredentialsSchema = typeof ValidateGitLabConnectionCredentialsSchema;

export type TGitLabConnectionConfig = DiscriminativePick<TGitLabConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TGitLabProject = {
  name: string;
  id: string;
};

export type TGitLabAccessTokenCredentials = {
  accessToken: string;
  instanceUrl: string;
};

export type TGitLabOAuthCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType?: string;
  createdAt?: Date;
  instanceUrl: string;
};

export type TGitLabOAuthCodeCredentials = {
  code: string;
  instanceUrl: string;
};

export type TGitLabRefreshTokenCredentials = {
  refreshToken: string;
  instanceUrl: string;
};

export interface TGitLabGroup {
  id: string;
  fullName: string;
}
