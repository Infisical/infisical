import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const CONVEX_ACCESS_KEY_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Convex Access Key",
  type: SecretRotation.ConvexAccessKey,
  connection: AppConnection.Convex,
  template: {
    secretsMapping: {
      accessKey: "CONVEX_ACCESS_KEY"
    }
  }
};
