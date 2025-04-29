import { TGenericPermission, TProjectPermission } from "@app/lib/types";

export type TCreateSshHostGroupDTO = {
  name: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
} & TProjectPermission;

export type TUpdateSshHostGroupDTO = {
  sshHostGroupId: string;
  name?: string;
  loginMappings?: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
} & TGenericPermission;

export type TGetSshHostGroupDTO = {
  sshHostGroupId: string;
} & TGenericPermission;

export type TDeleteSshHostGroupDTO = {
  sshHostGroupId: string;
} & TGenericPermission;
export type TListSshHostGroupHostsDTO = {
  sshHostGroupId: string;
} & TGenericPermission;

export type TAddHostToSshHostGroupDTO = {
  sshHostGroupId: string;
  hostId: string;
} & TGenericPermission;

export type TRemoveHostFromSshHostGroupDTO = {
  sshHostGroupId: string;
  hostId: string;
} & TGenericPermission;
