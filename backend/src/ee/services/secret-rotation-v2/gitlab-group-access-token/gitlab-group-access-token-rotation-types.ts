import { z } from "zod";

import { TGitLabConnection } from "@app/services/app-connection/gitlab/gitlab-connection-types";

import {
  CreateGitLabGroupAccessTokenRotationSchema,
  GitLabGroupAccessTokenRotationGeneratedCredentialsSchema,
  GitLabGroupAccessTokenRotationListItemSchema,
  GitLabGroupAccessTokenRotationSchema
} from "./gitlab-group-access-token-rotation-schemas";

export type TGitLabGroupAccessTokenRotation = z.infer<typeof GitLabGroupAccessTokenRotationSchema>;

export type TGitLabGroupAccessTokenRotationInput = z.infer<typeof CreateGitLabGroupAccessTokenRotationSchema>;

export type TGitLabGroupAccessTokenRotationListItem = z.infer<typeof GitLabGroupAccessTokenRotationListItemSchema>;

export type TGitLabGroupAccessTokenRotationWithConnection = TGitLabGroupAccessTokenRotation & {
  connection: TGitLabConnection;
};

export type TGitLabGroupAccessTokenRotationGeneratedCredentials = z.infer<
  typeof GitLabGroupAccessTokenRotationGeneratedCredentialsSchema
>;
