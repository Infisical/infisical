import { z } from "zod";

import { LdapProvider } from "@app/services/app-connection/ldap/ldap-connection-enums";
import { LdapConnectionSimpleBindCredentialsSchema } from "@app/services/app-connection/ldap/ldap-connection-schemas";

export type TLdapStrategyConfig = {
  provider: LdapProvider;
};

export type TLdapGeneratedCredential = {
  dn: string;
  password: string;
  createdAt: string;
};

export const LdapCredentialRotationCredentialsSchema = LdapConnectionSimpleBindCredentialsSchema;

export type TLdapCredentialRotationCredentials = z.infer<typeof LdapCredentialRotationCredentialsSchema>;
