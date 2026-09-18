import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const SNOWFLAKE_USER_KEY_PAIR_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Snowflake User Key Pair",
  type: SecretRotation.SnowflakeUserKeyPair,
  connection: AppConnection.Snowflake,
  template: {
    secretsMapping: {
      privateKey: "SNOWFLAKE_PRIVATE_KEY",
      publicKey: "SNOWFLAKE_PUBLIC_KEY"
    }
  }
};
