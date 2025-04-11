import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const AUTH0_CLIENT_SECRET_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Auth0 Client Secret",
  type: SecretRotation.Auth0ClientSecret,
  connection: AppConnection.Auth0,
  template: {
    secretsMapping: {
      clientId: "AUTH0_CLIENT_ID",
      clientSecret: "AUTH0_CLIENT_SECRET"
    }
  }
};
