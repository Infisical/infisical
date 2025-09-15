import { TGenericPermission } from "@app/lib/types";

import { EFilterReturnedIdentities } from "../identity-group/identity-group-types";

export type TCreateIdentityGroupProjectDTO = {
  projectId: string;
  groupIdOrName: string;
  roles: Array<{
    role: string;
    isTemporary?: boolean;
    temporaryMode?: string;
    temporaryRange?: string;
    temporaryAccessStartTime?: string;
  }>;
} & TGenericPermission;

export type TUpdateIdentityGroupInProjectDTO = {
  projectId: string;
  groupId: string;
  roles: Array<{
    role: string;
    isTemporary?: boolean;
    temporaryMode?: string;
    temporaryRange?: string;
    temporaryAccessStartTime?: string;
  }>;
} & TGenericPermission;

export type TRemoveIdentityGroupFromProjectDTO = {
  projectId: string;
  groupId: string;
} & TGenericPermission;

export type TListIdentityGroupsInProjectDTO = {
  projectId: string;
} & TGenericPermission;

export type TGetIdentityGroupInProjectDTO = {
  projectId: string;
  groupId: string;
} & TGenericPermission;

export type TListProjectIdentityGroupIdentitiesDTO = {
  projectId: string;
  id: string;
  offset?: number;
  limit?: number;
  search?: string;
  filter?: EFilterReturnedIdentities;
} & TGenericPermission;
