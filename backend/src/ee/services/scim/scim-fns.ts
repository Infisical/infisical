import { ScimError, scimPatch, ScimPatchOperation, ScimResource } from "scim-patch";
import { parse } from "scim2-parse-filter";

import { ScimRequestError } from "@app/lib/errors";
import { isUuidV4 } from "@app/lib/validator/validate-uuid";

import { TListScimGroups, TListScimUsers, TScimGroup, TScimUser } from "./scim-types";

export const buildScimUserList = ({
  scimUsers,
  startIndex,
  totalResults
}: {
  scimUsers: TScimUser[];
  startIndex: number;
  totalResults: number;
}): TListScimUsers => {
  return {
    Resources: scimUsers,
    itemsPerPage: scimUsers.length,
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    startIndex,
    totalResults
  };
};

const invalidScimFilter = (detail: string, error?: unknown) =>
  new ScimRequestError({ detail, status: 400, scimType: "invalidFilter", error });

const parseFilterOrThrow = (filter: string) => {
  try {
    return parse(filter);
  } catch (err) {
    throw invalidScimFilter(`The filter '${filter}' could not be parsed.`, err);
  }
};

export const assertParsableScimFilter = (filter: string | undefined) => {
  if (filter) parseFilterOrThrow(filter);
};

const SCIM_GROUP_FILTER_COLUMNS: Record<string, "name" | "id"> = {
  displayname: "name",
  id: "id"
};

/**
 * Groups support a single `eq` comparison on displayName or id, which is what IdPs send to
 * look a group up before creating it. Returns null when the filter can match no group.
 */
export const parseScimGroupFilter = (filter: string | undefined): { name?: string; id?: string } | null => {
  if (!filter) return {};

  const ast = parseFilterOrThrow(filter);
  const column =
    ast.op === "eq" && "attrPath" in ast ? SCIM_GROUP_FILTER_COLUMNS[ast.attrPath.toLowerCase()] : undefined;
  if (!column || !("compValue" in ast) || typeof ast.compValue !== "string") {
    throw invalidScimFilter(
      `The filter '${filter}' is not supported. Groups can be filtered by 'displayName eq "<name>"' or 'id eq "<id>"'.`
    );
  }

  if (column === "name") return { name: ast.compValue };
  return isUuidV4(ast.compValue) ? { id: ast.compValue } : null;
};

// A PATCH value is not validated by the route schema, and Entra sends booleans as "True"/"False".
export const isScimActive = (active: unknown) => String(active).toLowerCase() === "true";

export const applyScimPatch = <T extends ScimResource>(resource: T, operations: ScimPatchOperation[]) => {
  try {
    return scimPatch(resource, operations);
  } catch (err) {
    if (err instanceof ScimError) {
      throw new ScimRequestError({ detail: err.message, status: 400, scimType: err.scimCode, error: err });
    }
    throw err;
  }
};

export const buildScimUser = ({
  orgMembershipId,
  username,
  email,
  firstName,
  lastName,
  active,
  createdAt,
  updatedAt
}: {
  orgMembershipId: string;
  username: string;
  email?: string | null;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TScimUser => {
  const scimUser = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: orgMembershipId,
    userName: username,
    displayName: `${firstName} ${lastName}`,
    name: {
      givenName: firstName || "",
      middleName: null,
      familyName: lastName || ""
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
    meta: {
      resourceType: "User",
      created: createdAt,
      lastModified: updatedAt
    }
  };

  return scimUser;
};

export const buildScimGroupList = ({
  scimGroups,
  startIndex,
  totalResults
}: {
  scimGroups: TScimGroup[];
  startIndex: number;
  totalResults: number;
}): TListScimGroups => {
  return {
    Resources: scimGroups,
    itemsPerPage: scimGroups.length,
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    startIndex,
    totalResults
  };
};

export const buildScimGroup = ({
  groupId,
  name,
  members,
  updatedAt,
  createdAt
}: {
  groupId: string;
  name: string;
  members: {
    value: string;
    display?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}): TScimGroup => {
  const scimGroup = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    id: groupId,
    displayName: name,
    members,
    meta: {
      resourceType: "Group",
      created: createdAt,
      lastModified: updatedAt
    }
  };

  return scimGroup;
};
