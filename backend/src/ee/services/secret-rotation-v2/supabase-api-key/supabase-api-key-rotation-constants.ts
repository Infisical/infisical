import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const SUPABASE_API_KEY_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Supabase API Key",
  type: SecretRotation.SupabaseApiKey,
  connection: AppConnection.Supabase,
  template: {
    secretsMapping: {
      apiKey: "SUPABASE_API_KEY"
    }
  }
};
