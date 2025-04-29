import {
  AwsIamUserSecretRotationGeneratedCredentialsSchema,
  AwsIamUserSecretRotationSchema,
  CreateAwsIamUserSecretRotationSchema,
  UpdateAwsIamUserSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/aws-iam-user-secret";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerAwsIamUserSecretRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.AwsIamUserSecret,
    server,
    responseSchema: AwsIamUserSecretRotationSchema,
    createSchema: CreateAwsIamUserSecretRotationSchema,
    updateSchema: UpdateAwsIamUserSecretRotationSchema,
    generatedCredentialsSchema: AwsIamUserSecretRotationGeneratedCredentialsSchema
  });
