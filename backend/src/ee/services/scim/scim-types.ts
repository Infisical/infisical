import { ScimPatchOperation } from "scim-patch";

import { TOrgPermission } from "@app/lib/types";

export type TCreateScimTokenDTO = {
  description: string;
  ttlDays: number;
} & TOrgPermission;

export type TDeleteScimTokenDTO = {
  scimTokenId: string;
} & Omit<TOrgPermission, "orgId">;

// SCIM server endpoint types

export type TListScimUsersDTO = {
  startIndex: number;
  limit: number;
  filter?: string;
  orgId: string;
};

export type TListScimUsers = {
  schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"];
  totalResults: number;
  Resources: TScimUser[];
  itemsPerPage: number;
  startIndex: number;
};

export type TGetScimUserDTO = {
  orgMembershipId: string;
  orgId: string;
};

export type TCreateScimUserDTO = {
  externalId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  orgId: string;
};

export type TUpdateScimUserDTO = {
  orgMembershipId: string;
  orgId: string;
  operations: ScimPatchOperation[];
};

export type TReplaceScimUserDTO = {
  orgMembershipId: string;
  active: boolean;
  orgId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  externalId: string;
};

export type TDeleteScimUserDTO = {
  orgMembershipId: string;
  orgId: string;
};

export type TListScimGroupsDTO = {
  startIndex: number;
  filter?: string;
  limit: number;
  orgId: string;
  isMembersExcluded?: boolean;
};

export type TListScimGroups = {
  schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"];
  totalResults: number;
  Resources: TScimGroup[];
  itemsPerPage: number;
  startIndex: number;
};

export type TCreateScimGroupDTO = {
  displayName: string;
  orgId: string;
  members?: {
    // TODO: account for members with value and display (is this optional?)
    value: string;
    display: string;
  }[];
};

export type TGetScimGroupDTO = {
  groupId: string;
  orgId: string;
};

export type TUpdateScimGroupNamePutDTO = {
  groupId: string;
  orgId: string;
  displayName: string;
  members: {
    value: string;
    display: string;
  }[];
};

export type TUpdateScimGroupNamePatchDTO = {
  groupId: string;
  orgId: string;
  operations: ScimPatchOperation[];
};

export type TDeleteScimGroupDTO = {
  groupId: string;
  orgId: string;
};

export type TScimTokenJwtPayload = {
  scimTokenId: string;
  authTokenType: string;
};

export type TScimUser = {
  schemas: string[];
  id: string;
  userName: string;
  displayName: string;
  name: {
    givenName: string;
    middleName: null;
    familyName: string;
  };
  emails: {
    primary: boolean;
    value: string;
    type: string;
  }[];
  active: boolean;
  meta: {
    resourceType: string;
    created: Date;
    lastModified: Date;
  };
};

export type TScimGroup = {
  schemas: string[];
  id: string;
  displayName: string;
  members: {
    value: string;
    display?: string;
  }[];
  meta: {
    resourceType: string;
    created: Date;
    lastModified: Date;
  };
};
