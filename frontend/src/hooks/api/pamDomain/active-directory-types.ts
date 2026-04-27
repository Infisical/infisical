export enum ActiveDirectoryAccountType {
  User = "user",
  Service = "service"
}

export type TActiveDirectoryConnectionDetails = {
  domain: string;
  dcAddress: string;
  port: number;
  useLdaps: boolean;
  ldapRejectUnauthorized: boolean;
  ldapCaCert?: string;
  ldapTlsServerName?: string;
};

export type TActiveDirectoryCredentials = {
  username: string;
  password: string;
};

export type TActiveDirectoryAccountInternalMetadata = {
  accountType: ActiveDirectoryAccountType;
  adGuid?: string;
  userPrincipalName?: string;
  passwordLastSet?: string;
  lastLogon?: string;
};

export type TActiveDirectoryAccount = {
  id: string;
  name: string;
  description?: string | null;
  projectId: string;
  resourceId?: string | null;
  domainId?: string | null;
  folderId?: string | null;
  requireMfa: boolean;
  createdAt: string;
  updatedAt: string;
  credentials: TActiveDirectoryCredentials;
  internalMetadata: TActiveDirectoryAccountInternalMetadata;
};
