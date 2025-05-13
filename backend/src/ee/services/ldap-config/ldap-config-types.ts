import { TOrgPermission } from "@app/lib/types";

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
} & TOrgPermission;

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
}> &
  TOrgPermission;

export type TGetLdapCfgDTO = {
  orgId: string;
} & TOrgPermission;

export type TLdapLoginDTO = {
  ldapConfigId: string;
  externalId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  orgId: string;
  groups?: {
    dn: string;
    cn: string;
  }[];
  relayState?: string;
};

export type TGetLdapGroupMapsDTO = {
  ldapConfigId: string;
} & TOrgPermission;

export type TCreateLdapGroupMapDTO = {
  ldapConfigId: string;
  ldapGroupCN: string;
  groupSlug: string;
} & TOrgPermission;

export type TDeleteLdapGroupMapDTO = {
  ldapConfigId: string;
  ldapGroupMapId: string;
} & TOrgPermission;

export type TTestLdapConnectionDTO = {
  ldapConfigId: string;
} & TOrgPermission;
