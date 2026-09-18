import {
  CreateSalesforceOauthCredentialsRotationSchema,
  SalesforceOauthCredentialsRotationGeneratedCredentialsSchema,
  SalesforceOauthCredentialsRotationSchema,
  UpdateSalesforceOauthCredentialsRotationSchema
} from "@app/ee/services/secret-rotation-v2/salesforce-oauth-credentials";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerSalesforceOauthCredentialsRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.SalesforceOauthCredentials,
    server,
    responseSchema: SalesforceOauthCredentialsRotationSchema,
    createSchema: CreateSalesforceOauthCredentialsRotationSchema,
    updateSchema: UpdateSalesforceOauthCredentialsRotationSchema,
    generatedCredentialsSchema: SalesforceOauthCredentialsRotationGeneratedCredentialsSchema
  });
