import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const MYSQL_CREDENTIALS_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "MySQL Credentials",
  type: SecretRotation.MySqlCredentials,
  connection: AppConnection.MySql,
  template: {
    createUserStatement: `-- create user
CREATE USER 'infisical_user'@'%' IDENTIFIED BY 'temporary_password';

-- grant all privileges
GRANT ALL PRIVILEGES ON my_database.* TO 'infisical_user'@'%';

-- apply the privilege changes
FLUSH PRIVILEGES;`,
    rotationStatement: `ALTER USER '{{username}}'@'%' IDENTIFIED BY '{{password}}'`,
    secretsMapping: {
      username: "MYSQL_USERNAME",
      password: "MYSQL_PASSWORD"
    }
  }
};
