import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const OPENAI_ADMIN_API_KEY_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "OpenAI Admin API Key",
  type: SecretRotation.OpenAIAdminApiKey,
  connection: AppConnection.OpenAI,
  template: {
    secretsMapping: {
      apiKey: "OPENAI_ADMIN_API_KEY"
    }
  }
};
