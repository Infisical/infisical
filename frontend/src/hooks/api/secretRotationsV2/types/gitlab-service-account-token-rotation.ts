import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export enum GitLabTokenScope {
  Api = "api",
  ReadApi = "read_api",
  ReadUser = "read_user",
  ReadRepository = "read_repository",
  WriteRepository = "write_repository",
  ReadRegistry = "read_registry",
  WriteRegistry = "write_registry",
  ReadVirtualRegistry = "read_virtual_registry",
  WriteVirtualRegistry = "write_virtual_registry",
  CreateRunner = "create_runner",
  ManageRunner = "manage_runner",
  AiFeatures = "ai_features",
  K8sProxy = "k8s_proxy",
  SelfRotate = "self_rotate"
}

export type TGitLabServiceAccountTokenRotation = TSecretRotationV2Base & {
  type: SecretRotation.GitLabServiceAccountToken;
  parameters: {
    groupId: string;
    serviceAccountId: string;
    name: string;
    description?: string;
    scopes: GitLabTokenScope[];
  };
  secretsMapping: {
    tokenId: string;
    token: string;
  };
};

export type TGitLabServiceAccountTokenRotationGeneratedCredentials = {
  tokenId: string;
  token: string;
};

export type TGitLabServiceAccountTokenRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.GitLabServiceAccountToken,
    TGitLabServiceAccountTokenRotationGeneratedCredentials
  >;

export type TGitLabServiceAccountTokenRotationOption = {
  name: string;
  type: SecretRotation.GitLabServiceAccountToken;
  connection: AppConnection.GitLab;
  template: {
    secretsMapping: TGitLabServiceAccountTokenRotation["secretsMapping"];
  };
};
