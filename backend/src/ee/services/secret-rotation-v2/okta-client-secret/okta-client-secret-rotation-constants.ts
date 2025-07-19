import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const OKTA_CLIENT_SECRET_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Okta Client Secret",
  type: SecretRotation.OktaClientSecret,
  connection: AppConnection.Okta,
  template: {
    secretsMapping: {
      clientId: "OKTA_CLIENT_ID",
      clientSecret: "OKTA_CLIENT_SECRET"
    }
  }
};
