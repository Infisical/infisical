import { PamProductRole, PamResourceRole } from "../pam/pam-enums";

export type TListPamProductMembersDTO = {
  projectId: string;
};

export type TAddPamProductMemberDTO = {
  projectId: string;
  userId?: string;
  groupId?: string;
  identityId?: string;
  role: PamProductRole;
};

export type TAddPamProductUserMembersDTO = {
  projectId: string;
  userIds: string[];
  emails: string[];
  role: PamProductRole;
};

export type TUpdatePamProductMemberDTO = {
  projectId: string;
  userId?: string;
  groupId?: string;
  identityId?: string;
  role: PamProductRole;
};

export type TRemovePamProductMemberDTO = {
  projectId: string;
  userId?: string;
  groupId?: string;
  identityId?: string;
};

export type TListPamFolderMembersDTO = {
  projectId: string;
  folderId: string;
};

export type TAddPamFolderMemberDTO = {
  projectId: string;
  folderId: string;
  userId?: string;
  groupId?: string;
  identityId?: string;
  role: PamResourceRole;
  expiry?: string | null;
};

export type TUpdatePamFolderMemberDTO = {
  projectId: string;
  folderId: string;
  userId?: string;
  groupId?: string;
  identityId?: string;
  role: PamResourceRole;
};

export type TRemovePamFolderMemberDTO = {
  projectId: string;
  folderId: string;
  userId?: string;
  groupId?: string;
  identityId?: string;
};

export type TListPamAccountMembersDTO = {
  projectId: string;
  accountId: string;
};

export type TAddPamAccountMemberDTO = {
  projectId: string;
  accountId: string;
  userId?: string;
  groupId?: string;
  identityId?: string;
  role: PamResourceRole;
  expiry?: string | null;
};

export type TUpdatePamAccountMemberDTO = {
  projectId: string;
  accountId: string;
  userId?: string;
  groupId?: string;
  identityId?: string;
  role: PamResourceRole;
};

export type TRemovePamAccountMemberDTO = {
  projectId: string;
  accountId: string;
  userId?: string;
  groupId?: string;
  identityId?: string;
};
