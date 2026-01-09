import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const DATABRICKS_SERVICE_PRINCIPAL_SECRET_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Databricks Service Principal Secret",
  type: SecretRotation.DatabricksServicePrincipalSecret,
  connection: AppConnection.Databricks,
  template: {
    secretsMapping: {
      clientId: "DATABRICKS_CLIENT_ID",
      clientSecret: "DATABRICKS_CLIENT_SECRET"
    }
  }
};
