import { PamResourceType } from "../enums";
import { TBaseSqlConnectionDetails } from "./shared/sql-resource";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export enum MsSqlAuthMethod {
  SqlLogin = "sql-login",
  Ntlm = "ntlm"
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

export type TMsSQLCredentials = TMsSQLSqlLoginCredentials | TMsSQLNtlmCredentials;

// Resources
export type TMsSQLResource = TBasePamResource & { resourceType: PamResourceType.MsSQL } & {
  connectionDetails: TBaseSqlConnectionDetails;
};

// Accounts
export type TMsSQLAccount = TBasePamAccount & {
  credentials: TMsSQLCredentials;
};
