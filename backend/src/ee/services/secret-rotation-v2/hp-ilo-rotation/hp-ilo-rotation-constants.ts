import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { THpIloRotationListItem } from "./hp-ilo-rotation-types";

export const HP_ILO_ROTATION_LIST_OPTION: THpIloRotationListItem = {
  name: "HP iLO Local Account",
  type: SecretRotation.HpIloLocalAccount,
  connection: AppConnection.SSH,
  template: {
    secretsMapping: {
      username: "ILO_USERNAME",
      password: "ILO_PASSWORD"
    }
  }
};
