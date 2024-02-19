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
  offset: number;
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
  userId: string;
  orgId: string;
};

export type TCreateScimUserDTO = {
  email: string;
  firstName: string;
  lastName: string;
  orgId: string;
};

export type TUpdateScimUserDTO = {
  userId: string;
  orgId: string;
  operations: {
    op: string;
    path?: string;
    value?:
      | string
      | {
          active: boolean;
        };
  }[];
};

export type TReplaceScimUserDTO = {
  userId: string;
  active: boolean;
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
  groups: string[];
  meta: {
    resourceType: string;
    location: null;
  };
};
