import { TActorInput } from "@app/lib/types";

export type TLDAPConfig = {
  id: string;
  organization: string;
  isActive: boolean;
  url: string;
  bindDN: string;
  bindPass: string;
  uniqueUserAttribute: string;
  searchBase: string;
  groupSearchBase: string;
  groupSearchFilter: string;
  caCert: string;
  clientCertificate?: string;
  clientKeyCertificate?: string;
};

export type TTestLDAPConfigDTO = Omit<
  TLDAPConfig,
  "organization" | "id" | "groupSearchBase" | "groupSearchFilter" | "isActive" | "uniqueUserAttribute" | "searchBase"
>;

export type TCreateLdapCfgDTO = {
  orgId: string;
  isActive: boolean;
  url: string;
  bindDN: string;
  bindPass: string;
  uniqueUserAttribute: string;
  searchBase: string;
  searchFilter: string;
  groupSearchBase: string;
  groupSearchFilter: string;
  caCert: string;
  clientCertificate: string;
  clientKeyCertificate: string;
} & TActorInput;

export type TUpdateLdapCfgDTO = {
  orgId: string;
} & Partial<{
  isActive: boolean;
  url: string;
  bindDN: string;
  bindPass: string;
  uniqueUserAttribute: string;
  searchBase: string;
  searchFilter: string;
  groupSearchBase: string;
  groupSearchFilter: string;
  caCert: string;
  clientCertificate: string;
  clientKeyCertificate: string;
}> &
  ({ orgId: string } & TActorInput);

export type TGetLdapCfgDTO = {
  orgId: string;
} & TActorInput;

export type TLdapLoginDTO = {
  ldapConfigId: string;
  externalId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  orgId: string;
  ip: string;
  userAgent: string;
  groups?: {
    dn: string;
    cn: string;
  }[];
  callbackPort?: number;
};

export type TGetLdapGroupMapsDTO = {
  ldapConfigId: string;
  orgId: string;
} & TActorInput;

export type TCreateLdapGroupMapDTO = {
  ldapConfigId: string;
  ldapGroupCN: string;
  groupSlug: string;
  orgId: string;
} & TActorInput;

export type TDeleteLdapGroupMapDTO = {
  ldapConfigId: string;
  ldapGroupMapId: string;
  orgId: string;
} & TActorInput;

export type TTestLdapConnectionDTO = ({ orgId: string } & TActorInput) & TTestLDAPConfigDTO;
