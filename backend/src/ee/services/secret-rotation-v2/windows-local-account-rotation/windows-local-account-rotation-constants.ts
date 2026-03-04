import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { TWindowsLocalAccountRotationListItem } from "./windows-local-account-rotation-types";

export const WINDOWS_LOCAL_ACCOUNT_ROTATION_LIST_OPTION: TWindowsLocalAccountRotationListItem = {
  name: "Windows Local Account",
  type: SecretRotation.WindowsLocalAccount,
  connection: AppConnection.SMB,
  template: {
    secretsMapping: {
      username: "WINDOWS_USERNAME",
      password: "WINDOWS_PASSWORD"
    }
  }
};
