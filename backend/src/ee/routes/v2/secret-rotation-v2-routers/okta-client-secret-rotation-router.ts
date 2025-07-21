import {
  CreateOktaClientSecretRotationSchema,
  OktaClientSecretRotationGeneratedCredentialsSchema,
  OktaClientSecretRotationSchema,
  UpdateOktaClientSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/okta-client-secret";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerOktaClientSecretRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.OktaClientSecret,
    server,
    responseSchema: OktaClientSecretRotationSchema,
    createSchema: CreateOktaClientSecretRotationSchema,
    updateSchema: UpdateOktaClientSecretRotationSchema,
    generatedCredentialsSchema: OktaClientSecretRotationGeneratedCredentialsSchema
  });
