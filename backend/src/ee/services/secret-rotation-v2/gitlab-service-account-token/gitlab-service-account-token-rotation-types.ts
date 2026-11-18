import { z } from "zod";

import { TGitLabConnection } from "@app/services/app-connection/gitlab/gitlab-connection-types";

import {
  CreateGitLabServiceAccountTokenRotationSchema,
  GitLabServiceAccountTokenRotationGeneratedCredentialsSchema,
  GitLabServiceAccountTokenRotationListItemSchema,
  GitLabServiceAccountTokenRotationSchema
} from "./gitlab-service-account-token-rotation-schemas";

export type TGitLabServiceAccountTokenRotation = z.infer<typeof GitLabServiceAccountTokenRotationSchema>;

export type TGitLabServiceAccountTokenRotationInput = z.infer<typeof CreateGitLabServiceAccountTokenRotationSchema>;

export type TGitLabServiceAccountTokenRotationListItem = z.infer<
  typeof GitLabServiceAccountTokenRotationListItemSchema
>;

export type TGitLabServiceAccountTokenRotationWithConnection = TGitLabServiceAccountTokenRotation & {
  connection: TGitLabConnection;
};

export type TGitLabServiceAccountTokenRotationGeneratedCredentials = z.infer<
  typeof GitLabServiceAccountTokenRotationGeneratedCredentialsSchema
>;
