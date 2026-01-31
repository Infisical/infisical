import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const DBT_SERVICE_TOKEN_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "DBT Service Token",
  type: SecretRotation.DbtServiceToken,
  connection: AppConnection.Dbt,
  template: {
    secretsMapping: {
      serviceToken: "DBT_SERVICE_TOKEN"
    }
  }
};
