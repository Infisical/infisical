import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const SALESFORCE_OAUTH_CREDENTIALS_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Salesforce OAuth Credentials",
  type: SecretRotation.SalesforceOauthCredentials,
  connection: AppConnection.Salesforce,
  template: {
    secretsMapping: {
      consumerKey: "SALESFORCE_CONSUMER_KEY",
      consumerSecret: "SALESFORCE_CONSUMER_SECRET"
    }
  }
};
