import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

/**
 * Key-generation options that cannot be set via the additional options JSON, either because
 * Infisical owns them for the rotation lifecycle or because they have dedicated form fields:
 * - key_alias is generated per key (embeds creation time + guarantees uniqueness)
 * - auto_rotate / rotation_interval would conflict with Infisical's create/delete rotation
 * - duration would expire the key out from under Infisical
 * - send_invite_email is irrelevant for machine-managed keys
 * - key_type is intentionally left to the LiteLLM instance default
 * - user_id / team_id / models have dedicated parameter fields
 */
export const LITELLM_RESERVED_KEY_OPTIONS = [
  "key_alias",
  "auto_rotate",
  "rotation_interval",
  "duration",
  "send_invite_email",
  "key_type",
  "user_id",
  "team_id",
  "models"
];

export const LITELLM_API_KEY_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "LiteLLM API Key",
  type: SecretRotation.LiteLLMApiKey,
  connection: AppConnection.LiteLLM,
  template: {
    secretsMapping: {
      apiKey: "LITELLM_API_KEY"
    }
  }
};
