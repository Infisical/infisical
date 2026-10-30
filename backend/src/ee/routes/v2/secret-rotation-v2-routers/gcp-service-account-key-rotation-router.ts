import {
  CreateGcpServiceAccountKeyRotationSchema,
  GcpServiceAccountKeyRotationGeneratedCredentialsSchema,
  GcpServiceAccountKeyRotationSchema,
  UpdateGcpServiceAccountKeyRotationSchema
} from "@app/ee/services/secret-rotation-v2/gcp-service-account-key";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerGcpServiceAccountKeyRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.GcpServiceAccountKey,
    server,
    responseSchema: GcpServiceAccountKeyRotationSchema,
    createSchema: CreateGcpServiceAccountKeyRotationSchema,
    updateSchema: UpdateGcpServiceAccountKeyRotationSchema,
    generatedCredentialsSchema: GcpServiceAccountKeyRotationGeneratedCredentialsSchema
  });
