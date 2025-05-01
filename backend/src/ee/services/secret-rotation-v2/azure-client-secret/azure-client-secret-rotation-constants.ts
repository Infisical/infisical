import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const AZURE_CLIENT_SECRET_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Azure Client Secret",
  type: SecretRotation.AzureClientSecret,
  connection: AppConnection.AzureClientSecrets,
  template: {
    secretsMapping: {
      clientId: "AZURE_CLIENT_ID",
      clientSecret: "AZURE_CLIENT_SECRET"
    }
  }
};
