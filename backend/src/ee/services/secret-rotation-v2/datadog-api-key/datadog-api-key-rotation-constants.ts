import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const DATADOG_API_KEY_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Datadog API Key",
  type: SecretRotation.DatadogApiKey,
  connection: AppConnection.Datadog,
  template: {
    secretsMapping: {
      apiKeyId: "DATADOG_API_KEY_ID",
      apiKey: "DATADOG_API_KEY"
    }
  }
};
