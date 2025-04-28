import { z } from "zod";

import { TLdapConnection } from "@app/services/app-connection/ldap";

import {
  CreateLdapPasswordRotationSchema,
  LdapPasswordRotationGeneratedCredentialsSchema,
  LdapPasswordRotationListItemSchema,
  LdapPasswordRotationSchema
} from "./ldap-password-rotation-schemas";

export type TLdapPasswordRotation = z.infer<typeof LdapPasswordRotationSchema>;

export type TLdapPasswordRotationInput = z.infer<typeof CreateLdapPasswordRotationSchema>;

export type TLdapPasswordRotationListItem = z.infer<typeof LdapPasswordRotationListItemSchema>;

export type TLdapPasswordRotationWithConnection = TLdapPasswordRotation & {
  connection: TLdapConnection;
};

export type TLdapPasswordRotationGeneratedCredentials = z.infer<typeof LdapPasswordRotationGeneratedCredentialsSchema>;
