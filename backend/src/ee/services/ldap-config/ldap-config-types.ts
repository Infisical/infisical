import { TOrgPermission } from "@app/lib/types";

export type TCreateLdapCfgDTO = {
  isActive: boolean;
  url: string;
  bindDN: string;
  bindPass: string;
  searchBase: string;
  caCert: string;
} & TOrgPermission;

export type TUpdateLdapCfgDTO = Partial<{
  isActive: boolean;
  url: string;
  bindDN: string;
  bindPass: string;
  searchBase: string;
  caCert: string;
}> &
  TOrgPermission;

export type TLdapLoginDTO = {
  externalId: string;
  username: string;
  firstName: string;
  lastName: string;
  emails: string[];
  orgId: string;
  relayState?: string;
};
