import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum LdapConnectionMethod {
  SimpleBind = "simple-bind"
}

export enum LdapConnectionProvider {
  ActiveDirectory = "active-directory"
}

export type TLdapConnection = TRootAppConnection & { app: AppConnection.LDAP } & {
  method: LdapConnectionMethod.SimpleBind;
  credentials: {
    provider: LdapConnectionProvider;
    url: string;
    dn: string;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
};
