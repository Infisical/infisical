import { TLoginMapping, TSshHost } from "../sshHost/types";

export type TSshHostGroup = {
  id: string;
  projectId: string;
  name: string;
  loginMappings: Omit<TLoginMapping, "source">[];
};

export type TCreateSshHostGroupDTO = {
  projectId: string;
  name: string;
  loginMappings: Omit<TLoginMapping, "source">[];
};

export type TUpdateSshHostGroupDTO = {
  sshHostGroupId: string;
  name?: string;
  loginMappings?: Omit<TLoginMapping, "source">[];
};

export type TDeleteSshHostGroupDTO = {
  sshHostGroupId: string;
};

export type TListSshHostGroupHostsResponse = {
  hosts: (TSshHost & { joinedGroupAt: string; isPartOfGroup: boolean })[];
  totalCount: number;
};

export enum EHostGroupMembershipFilter {
  GROUP_MEMBERS = "group-members",
  NON_GROUP_MEMBERS = "non-group-members"
}
