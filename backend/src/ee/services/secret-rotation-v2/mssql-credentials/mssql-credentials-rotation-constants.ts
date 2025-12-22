import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const MSSQL_CREDENTIALS_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Microsoft SQL Server Credentials",
  type: SecretRotation.MsSqlCredentials,
  connection: AppConnection.MsSql,
  template: {
    createUserStatement: `-- Create login at the server level
CREATE LOGIN [infisical_user] WITH PASSWORD = 'my-password';

-- Grant server-level connect permission
GRANT CONNECT SQL TO [infisical_user];

-- Switch to the database where you want to create the user
USE my_database;

-- Create the database user mapped to the login
CREATE USER [infisical_user] FOR LOGIN [infisical_user];

-- Grant permissions to the user on the schema in this database
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [infisical_user];`,
    rotationStatement: `ALTER LOGIN [{{username}}] WITH PASSWORD = '{{password}}'`,
    secretsMapping: {
      username: "MSSQL_DB_USERNAME",
      password: "MSSQL_DB_PASSWORD"
    }
  }
};
