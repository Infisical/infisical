import { TSshHost } from "../sshHost/types";

export type TSshHostGroup = {
  id: string;
  projectId: string;
  name: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
};

export type TCreateSshHostGroupDTO = {
  projectId: string;
  name: string;
  loginMappings: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
};

export type TUpdateSshHostGroupDTO = {
  sshHostGroupId: string;
  name?: string;
  loginMappings?: {
    loginUser: string;
    allowedPrincipals: {
      usernames: string[];
    };
  }[];
};

export type TDeleteSshHostGroupDTO = {
  sshHostGroupId: string;
};

export type TListSshHostGroupHostsResponse = {
  hosts: TSshHost & { joinedGroupAt: string; isPartOfGroup: boolean }[];
  totalCount: number;
};

export enum EHostGroupMembershipFilter {
  GROUP_MEMBERS = "group-members",
  NON_GROUP_MEMBERS = "non-group-members"
}
