import { TOrgPermission } from "@app/lib/types";

export type TCreateLdapCfgDTO = {
  orgId: string;
  isActive: boolean;
  url: string;
  bindDN: string;
  bindPass: string;
  searchBase: string;
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
  searchBase: string;
  groupSearchBase: string;
  groupSearchFilter: string;
  caCert: string;
}> &
  TOrgPermission;

export type TGetLdapCfgDTO = {
  orgId: string;
} & TOrgPermission;

export type TLdapLoginDTO = {
  externalId: string;
  username: string;
  firstName: string;
  lastName: string;
  emails: string[];
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
