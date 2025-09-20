import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const REDIS_CREDENTIALS_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Redis Credentials",
  type: SecretRotation.RedisCredentials,
  connection: AppConnection.Redis,
  template: {
    secretsMapping: {
      username: "REDIS_USERNAME",
      password: "REDIS_PASSWORD"
    }
  }
};
