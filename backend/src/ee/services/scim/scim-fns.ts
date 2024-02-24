import { TListScimUsers, TScimUser } from "./scim-types";

export const buildScimUserList = ({
  scimUsers,
  offset,
  limit
}: {
  scimUsers: TScimUser[];
  offset: number;
  limit: number;
}): TListScimUsers => {
  return {
    Resources: scimUsers,
    itemsPerPage: limit,
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    startIndex: offset,
    totalResults: scimUsers.length
  };
};

export const buildScimUser = ({
  userId,
  firstName,
  lastName,
  email,
  active
}: {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  active: boolean;
}): TScimUser => {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: userId,
    userName: email,
    displayName: `${firstName} ${lastName}`,
    name: {
      givenName: firstName,
      middleName: null,
      familyName: lastName
    },
    emails: [
      {
        primary: true,
        value: email,
        type: "work"
      }
    ],
    active,
    groups: [],
    meta: {
      resourceType: "User",
      location: null
    }
  };
};
