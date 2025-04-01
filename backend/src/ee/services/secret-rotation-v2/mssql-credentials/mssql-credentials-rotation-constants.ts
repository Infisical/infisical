import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const MSSQL_CREDENTIALS_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Microsoft SQL Server Credentials",
  type: SecretRotation.MsSqlCredentials,
  connection: AppConnection.MsSql,
  template: {
    createUserStatement: `CREATE LOGIN [my_mssql_user] WITH PASSWORD = 'my_temporary_password'; CREATE USER [my_mssql_user] FOR LOGIN [my_mssql_user]; GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [my_mssql_user];`,
    secretsMapping: {
      username: "MSSQL_DB_USERNAME",
      password: "MSSQL_DB_PASSWORD"
    }
  }
};
