import {
  CreateLdapPasswordRotationSchema,
  LdapPasswordRotationGeneratedCredentialsSchema,
  LdapPasswordRotationSchema,
  UpdateLdapPasswordRotationSchema
} from "@app/ee/services/secret-rotation-v2/ldap-password";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerLdapPasswordRotationRouter = async (server: FastifyZodProvider) =>
  registerSecretRotationEndpoints({
    type: SecretRotation.LdapPassword,
    server,
    responseSchema: LdapPasswordRotationSchema,
    createSchema: CreateLdapPasswordRotationSchema,
    updateSchema: UpdateLdapPasswordRotationSchema,
    generatedCredentialsSchema: LdapPasswordRotationGeneratedCredentialsSchema
  });
