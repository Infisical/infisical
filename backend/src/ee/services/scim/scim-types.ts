import { ScimPatchOperation } from "scim-patch";

import { TScimTokens } from "@app/db/schemas";
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

export type TExpiringScimToken = {
  id: string;
  ttlDays: number;
  description: string;
  orgId: string;
  createdAt: Date;
  orgName: string;
  adminEmails: string[];
};

export type TScimServiceFactory = {
  createScimToken: (arg: TCreateScimTokenDTO) => Promise<{
    scimToken: string;
  }>;
  listScimTokens: (arg: TOrgPermission) => Promise<TScimTokens[]>;
  deleteScimToken: (arg: TDeleteScimTokenDTO) => Promise<{
    orgId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description: string;
    ttlDays: number;
  }>;
  listScimUsers: (arg: TListScimUsersDTO) => Promise<TListScimUsers>;
  getScimUser: (arg: TGetScimUserDTO) => Promise<TScimUser>;
  createScimUser: (arg: TCreateScimUserDTO) => Promise<TScimUser>;
  updateScimUser: (arg: TUpdateScimUserDTO) => Promise<TScimUser>;
  replaceScimUser: (arg: TReplaceScimUserDTO) => Promise<TScimUser>;
  deleteScimUser: (arg: TDeleteScimUserDTO) => Promise<object>;
  listScimGroups: (arg: TListScimGroupsDTO) => Promise<TListScimGroups>;
  createScimGroup: (arg: TCreateScimGroupDTO) => Promise<TScimGroup>;
  getScimGroup: (arg: TGetScimGroupDTO) => Promise<TScimGroup>;
  deleteScimGroup: (arg: TDeleteScimGroupDTO) => Promise<object>;
  replaceScimGroup: (arg: TUpdateScimGroupNamePutDTO) => Promise<TScimGroup>;
  updateScimGroup: (arg: TUpdateScimGroupNamePatchDTO) => Promise<{
    members: {
      value: string;
      display: string;
    }[];
    schemas: string[];
    id: string;
    displayName: string;
    meta: {
      resourceType: string;
      created: Date;
      lastModified: Date;
    };
  }>;
  fnValidateScimToken: (token: TScimTokenJwtPayload) => Promise<{
    scimTokenId: string;
    orgId: string;
  }>;
  notifyExpiringTokens: () => Promise<number>;
};
