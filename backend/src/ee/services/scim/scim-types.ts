import { TOrgPermission } from "@app/lib/types";
import { TScimUser } from "@app/lib/scim";

export type TCreateScimTokenDTO = {
    organizationId: string;
    description: string;
    ttl: number;
} 

// TODO: add org permissions
// & Omit<TOrgPermission, "orgId">;

export type TListScimUsersDTO = {
    offset: number;
    limit: number;
    filter?: string;
}

export type TListScimUsersRes = { // check naming here
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"];
    totalResults: number;
    Resources: TScimUser[];
    itemsPerPage: number;
    startIndex: number;
}

export type TCreateScimUserDTO = {
    email: string;
    firstName: string;
    lastName: string;
    orgId: string;
}

export type TCreateScimUserRes = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"]
}

export type TScimTokenJwtPayload = {
    scimTokenId: string;
    authTokenType: string;
};