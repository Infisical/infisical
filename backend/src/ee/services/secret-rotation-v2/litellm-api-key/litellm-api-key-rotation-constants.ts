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

/**
 * Additional options that must not be set on rotated keys. Unlike reserved options (Infisical-owned
 * fields), these are blocked because they would grant permissions that could affect other keys —
 * e.g. allowed_routes, permission, or object_permission.
 */
export const LITELLM_FORBIDDEN_KEY_OPTIONS = ["allowed_routes", "permission", "object_permission"];

/** Max number of top-level keys allowed in the additional options JSON object. */
export const LITELLM_ADDITIONAL_OPTIONS_MAX_KEYS = 55;

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
