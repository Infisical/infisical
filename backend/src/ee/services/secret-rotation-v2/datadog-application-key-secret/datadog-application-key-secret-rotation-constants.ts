import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const DATADOG_APPLICATION_KEY_SECRET_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Datadog Application Key Secret",
  type: SecretRotation.DatadogApplicationKeySecret,
  connection: AppConnection.Datadog,
  template: {
    secretsMapping: {
      applicationKeyId: "DATADOG_APPLICATION_KEY_ID",
      applicationKey: "DATADOG_APPLICATION_KEY"
    }
  }
};
