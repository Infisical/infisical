import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const CLOUDFLARE_API_TOKEN_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "Cloudflare API Token",
  type: SecretRotation.CloudflareApiToken,
  connection: AppConnection.Cloudflare,
  template: {
    secretsMapping: {
      tokenId: "CLOUDFLARE_API_TOKEN_ID",
      apiToken: "CLOUDFLARE_API_TOKEN"
    }
  }
};
