import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { TSecretRotationV2ListItem } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const AWS_IAM_USER_SECRET_ROTATION_LIST_OPTION: TSecretRotationV2ListItem = {
  name: "AWS IAM User Secret",
  type: SecretRotation.AwsIamUserSecret,
  connection: AppConnection.AWS,
  template: {
    secretsMapping: {
      accessKeyId: "AWS_ACCESS_KEY_ID",
      secretAccessKey: "AWS_SECRET_ACCESS_KEY"
    }
  }
};
