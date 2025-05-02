import { TLoginMapping } from "@app/ee/services/ssh-host/ssh-host-types";
import { TProjectPermission } from "@app/lib/types";

export type TCreateSshHostGroupDTO = {
  name: string;
  loginMappings: TLoginMapping[];
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
} & Omit<TProjectPermission, "projectId">;

export type TGetSshHostGroupDTO = {
  sshHostGroupId: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteSshHostGroupDTO = {
  sshHostGroupId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListSshHostGroupHostsDTO = {
  sshHostGroupId: string;
  filter?: EHostGroupMembershipFilter;
} & Omit<TProjectPermission, "projectId">;

export type TAddHostToSshHostGroupDTO = {
  sshHostGroupId: string;
  hostId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRemoveHostFromSshHostGroupDTO = {
  sshHostGroupId: string;
  hostId: string;
} & Omit<TProjectPermission, "projectId">;

export enum EHostGroupMembershipFilter {
  GROUP_MEMBERS = "group-members",
  NON_GROUP_MEMBERS = "non-group-members"
}
