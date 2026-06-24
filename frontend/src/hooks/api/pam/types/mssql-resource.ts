import { PamResourceType } from "../enums";
import { TBaseSqlConnectionDetails } from "./shared/sql-resource";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export enum MsSqlAuthMethod {
  SqlLogin = "sql-login",
  Ntlm = "ntlm",
  Kerberos = "kerberos"
}

export type TMsSQLSqlLoginCredentials = {
  authMethod: MsSqlAuthMethod.SqlLogin;
  username: string;
  password: string;
};

export type TMsSQLNtlmCredentials = {
  authMethod: MsSqlAuthMethod.Ntlm;
  username: string;
  password: string;
  domain: string;
};

export type TMsSQLKerberosCredentials = {
  authMethod: MsSqlAuthMethod.Kerberos;
  username: string;
  password: string;
  realm: string;
  kdcAddress?: string;
  spn: string;
};

export type TMsSQLCredentials =
  | TMsSQLSqlLoginCredentials
  | TMsSQLNtlmCredentials
  | TMsSQLKerberosCredentials;

// Resources
export type TMsSQLResource = TBasePamResource & { resourceType: PamResourceType.MsSQL } & {
  connectionDetails: TBaseSqlConnectionDetails;
};

// Accounts
export type TMsSQLAccount = TBasePamAccount & {
  credentials: TMsSQLCredentials;
};
