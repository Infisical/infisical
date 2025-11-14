import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  CreateLdapConnectionSchema,
  LdapConnectionSchema,
  ValidateLdapConnectionCredentialsSchema
} from "./ldap-connection-schemas";

export type TLdapConnection = z.infer<typeof LdapConnectionSchema>;

export type TLdapConnectionInput = z.infer<typeof CreateLdapConnectionSchema> & {
  app: AppConnection.LDAP;
};

export type TValidateLdapConnectionCredentialsSchema = typeof ValidateLdapConnectionCredentialsSchema;

export type TLdapConnectionConfig = DiscriminativePick<
  TLdapConnectionInput,
  "method" | "app" | "credentials" | "gatewayId"
> & {
  orgId: string;
};
