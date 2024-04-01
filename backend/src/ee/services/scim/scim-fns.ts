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
  username,
  email,
  firstName,
  lastName,
  active
}: {
  userId: string;
  username: string;
  email?: string | null;
  firstName: string;
  lastName: string;
  active: boolean;
}): TScimUser => {
  const scimUser = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: userId,
    userName: username,
    displayName: `${firstName} ${lastName}`,
    name: {
      givenName: firstName,
      middleName: null,
      familyName: lastName
    },
    emails: email
      ? [
          {
            primary: true,
            value: email,
            type: "work"
          }
        ]
      : [],
    active,
    groups: [],
    meta: {
      resourceType: "User",
      location: null
    }
  };

  return scimUser;
};

export const buildScimGroup = ({
  groupId,
  name,
  members
}: {
  groupId: string;
  name: string;
  members: {
    value: string;
    display: string;
  }[];
}) => {
  const scimGroup = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    id: groupId,
    displayName: name,
    members,
    meta: {
      resourceType: "Group"
    }
  };

  return scimGroup;
};
