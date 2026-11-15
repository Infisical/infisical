import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const CLICKHOUSE_CREDENTIALS_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "ClickHouse Credentials",
  type: SecretRotation.ClickHouseCredentials,
  connection: AppConnection.ClickHouse,
  template: {
    createUserStatement: `-- create users
CREATE USER infisical_user_1 IDENTIFIED WITH sha256_password BY 'temporary_password';
CREATE USER infisical_user_2 IDENTIFIED WITH sha256_password BY 'temporary_password';

-- grant both users the same permissions
GRANT SELECT ON my_database.* TO infisical_user_1, infisical_user_2;`,
    secretsMapping: {
      username: "CLICKHOUSE_DB_USERNAME",
      password: "CLICKHOUSE_DB_PASSWORD"
    }
  }
};
