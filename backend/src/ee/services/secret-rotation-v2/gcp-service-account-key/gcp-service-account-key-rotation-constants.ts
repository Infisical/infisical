import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GCP_SERVICE_ACCOUNT_KEY_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "GCP Service Account Key",
  type: SecretRotation.GcpServiceAccountKey,
  connection: AppConnection.GCP,
  template: {
    secretsMapping: {
      serviceAccountKey: "GCP_SERVICE_ACCOUNT_KEY"
    }
  }
};
