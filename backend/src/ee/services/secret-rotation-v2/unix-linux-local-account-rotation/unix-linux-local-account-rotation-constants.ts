import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { TUnixLinuxLocalAccountRotationListItem } from "./unix-linux-local-account-rotation-types";

export const UNIX_LINUX_LOCAL_ACCOUNT_ROTATION_LIST_OPTION: TUnixLinuxLocalAccountRotationListItem = {
  name: "Unix/Linux Local Account",
  type: SecretRotation.UnixLinuxLocalAccount,
  connection: AppConnection.SSH,
  template: {
    secretsMapping: {
      username: "UNIX_USERNAME",
      password: "UNIX_PASSWORD"
    }
  }
};
