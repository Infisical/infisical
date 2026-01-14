import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { TSshPasswordRotationListItem } from "./ssh-password-rotation-types";

export const SSH_PASSWORD_ROTATION_LIST_OPTION: TSshPasswordRotationListItem = {
  name: "SSH Password",
  type: SecretRotation.SshPassword,
  connection: AppConnection.SSH,
  template: {
    secretsMapping: {
      username: "SSH_USERNAME",
      password: "SSH_PASSWORD"
    }
  }
};
