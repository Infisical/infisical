import {
  AzureCertificateRotationGeneratedCredentialsSchema,
  AzureCertificateRotationSchema,
  CreateAzureCertificateRotationSchema,
  UpdateAzureCertificateRotationSchema
} from "@app/ee/services/secret-rotation-v2/azure-certificate";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerAzureCertificateRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.AzureCertificate,
    server,
    responseSchema: AzureCertificateRotationSchema,
    createSchema: CreateAzureCertificateRotationSchema,
    updateSchema: UpdateAzureCertificateRotationSchema,
    generatedCredentialsSchema: AzureCertificateRotationGeneratedCredentialsSchema
  });
