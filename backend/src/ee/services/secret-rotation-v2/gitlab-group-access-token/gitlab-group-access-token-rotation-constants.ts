import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GITLAB_GROUP_ACCESS_TOKEN_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "GitLab Group Access Token",
  type: SecretRotation.GitLabGroupAccessToken,
  connection: AppConnection.GitLab,
  template: {
    secretsMapping: {
      tokenId: "GITLAB_TOKEN_ID",
      token: "GITLAB_TOKEN"
    }
  }
};
