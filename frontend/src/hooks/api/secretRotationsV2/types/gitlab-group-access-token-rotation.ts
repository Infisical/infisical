import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { GitLabTokenScope } from "@app/hooks/api/secretRotationsV2/types/gitlab-service-account-token-rotation";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export enum GitLabTokenAccessLevel {
  Guest = 10,
  Planner = 15,
  Reporter = 20,
  SecurityManager = 25,
  Developer = 30,
  Maintainer = 40,
  Owner = 50
}

export const GITLAB_TOKEN_ACCESS_LEVEL_LABELS: Record<GitLabTokenAccessLevel, string> = {
  [GitLabTokenAccessLevel.Guest]: "Guest",
  [GitLabTokenAccessLevel.Planner]: "Planner",
  [GitLabTokenAccessLevel.Reporter]: "Reporter",
  [GitLabTokenAccessLevel.SecurityManager]: "Security Manager",
  [GitLabTokenAccessLevel.Developer]: "Developer",
  [GitLabTokenAccessLevel.Maintainer]: "Maintainer",
  [GitLabTokenAccessLevel.Owner]: "Owner"
};

// read_user only works on personal access tokens
export const GITLAB_GROUP_ACCESS_TOKEN_SCOPES = Object.values(GitLabTokenScope).filter(
  (scope) => scope !== GitLabTokenScope.ReadUser
);

export type TGitLabGroupAccessTokenRotation = TSecretRotationV2Base & {
  type: SecretRotation.GitLabGroupAccessToken;
  parameters: {
    groupId: string;
    name: string;
    description?: string;
    scopes: GitLabTokenScope[];
    accessLevel: GitLabTokenAccessLevel;
  };
  secretsMapping: {
    tokenId: string;
    token: string;
  };
};

export type TGitLabGroupAccessTokenRotationGeneratedCredentials = {
  tokenId: string;
  token: string;
};

export type TGitLabGroupAccessTokenRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.GitLabGroupAccessToken,
    TGitLabGroupAccessTokenRotationGeneratedCredentials
  >;

export type TGitLabGroupAccessTokenRotationOption = {
  name: string;
  type: SecretRotation.GitLabGroupAccessToken;
  connection: AppConnection.GitLab;
  template: {
    secretsMapping: TGitLabGroupAccessTokenRotation["secretsMapping"];
  };
};
