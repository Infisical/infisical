import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const OPEN_ROUTER_API_KEY_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "OpenRouter API Key",
  type: SecretRotation.OpenRouterApiKey,
  connection: AppConnection.OpenRouter,
  template: {
    secretsMapping: {
      apiKey: "OPEN_ROUTER_API_KEY"
    }
  }
};
