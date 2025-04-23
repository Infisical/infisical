import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateLdapConnectionSchema,
  SanitizedLdapConnectionSchema,
  UpdateLdapConnectionSchema
} from "@app/services/app-connection/ldap";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerLdapConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.LDAP,
    server,
    sanitizedResponseSchema: SanitizedLdapConnectionSchema,
    createSchema: CreateLdapConnectionSchema,
    updateSchema: UpdateLdapConnectionSchema
  });
};
