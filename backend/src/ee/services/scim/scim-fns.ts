import { TListScimGroups, TListScimUsers, TScimGroup, TScimUser } from "./scim-types";

export const buildScimUserList = ({
  scimUsers,
  startIndex,
  limit
}: {
  scimUsers: TScimUser[];
  startIndex: number;
  limit: number;
}): TListScimUsers => {
  return {
    Resources: scimUsers,
    itemsPerPage: limit,
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    startIndex,
    totalResults: scimUsers.length
  };
};

export const parseScimFilter = (filterToParse: string | undefined) => {
  if (!filterToParse) return {};
  const [parsedName, parsedValue] = filterToParse.split("eq").map((s) => s.trim());

  let attributeName = parsedName;
  if (parsedName === "userName") {
    attributeName = "email";
  } else if (parsedName === "displayName") {
    attributeName = "name";
  }

  return { [attributeName]: parsedValue.replace(/"/g, "") };
};

export function extractScimValueFromPath(path: string): string | null {
  const regex = /members\[value eq "([^"]+)"\]/;
  const match = path.match(regex);
  return match ? match[1] : null;
}

export const buildScimUser = ({
  orgMembershipId,
  username,
  email,
  firstName,
  lastName,
  groups = [],
  active
}: {
  orgMembershipId: string;
  username: string;
  email?: string | null;
  firstName: string;
  lastName: string;
  groups?: {
    value: string;
    display: string;
  }[];
  active: boolean;
}): TScimUser => {
  const scimUser = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: orgMembershipId,
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
    groups,
    meta: {
      resourceType: "User",
      location: null
    }
  };

  return scimUser;
};

export const buildScimGroupList = ({
  scimGroups,
  startIndex,
  limit
}: {
  scimGroups: TScimGroup[];
  startIndex: number;
  limit: number;
}): TListScimGroups => {
  return {
    Resources: scimGroups,
    itemsPerPage: limit,
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    startIndex,
    totalResults: scimGroups.length
  };
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
}): TScimGroup => {
  const scimGroup = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    id: groupId,
    displayName: name,
    members,
    meta: {
      resourceType: "Group",
      location: null
    }
  };

  return scimGroup;
};
