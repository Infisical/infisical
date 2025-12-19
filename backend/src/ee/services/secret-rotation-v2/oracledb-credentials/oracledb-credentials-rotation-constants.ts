import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const ORACLEDB_CREDENTIALS_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "OracleDB Credentials",
  type: SecretRotation.OracleDBCredentials,
  connection: AppConnection.OracleDB,
  template: {
    createUserStatement: `-- create user
CREATE USER INFISICAL_USER IDENTIFIED BY "temporary_password";

-- grant all privileges
GRANT ALL PRIVILEGES TO INFISICAL_USER;`,
    rotationStatement: `ALTER USER "{{username}}" IDENTIFIED BY "{{password}}"`,
    secretsMapping: {
      username: "ORACLEDB_USERNAME",
      password: "ORACLEDB_PASSWORD"
    }
  }
};
