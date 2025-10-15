import { Knex } from "knex";

import { AccessScopeData } from "@app/db/schemas";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";

export interface TIdentityScopeFactory {
  onCreateIdentityGuard: (arg: TCreateIdentityDTO) => Promise<void>;
  onCreateIdentityDBOperations: (
    arg: TCreateIdentityDTO,
    identityId: string,
    tx: Knex
  ) => Promise<{ membershipIds: string[] }>;
  onUpdateIdentityGuard: (arg: TUpdateIdentityDTO) => Promise<void>;
  onDeleteIdentityGuard: (arg: TDeleteIdentityDTO) => Promise<void>;
  onListIdentityGuard: (arg: TListIdentityDTO) => Promise<void>;
  onGetIdentityByIdGuard: (arg: TGetIdentityByIdDTO) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "namespaceId" | "projectId"; value: string };
}

export enum IdentityOrderBy {
  Name = "name",
  Role = "role"
}

export type TCreateIdentityDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    name: string;
    hasDeleteProtection: boolean;
    metadata?: { key: string; value: string }[];
  };
};

export type TUpdateIdentityDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
  };
  data: Partial<{
    name: string;
    hasDeleteProtection: boolean;
    metadata?: { key: string; value: string }[];
  }>;
};

export type TDeleteIdentityDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
  };
};

export type TGetIdentityByIdDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
  };
};

export type TListIdentityDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: Partial<{
    limit: number;
    offset: number;
    orderBy: IdentityOrderBy;
    orderDirection: OrderByDirection;
    search: string;
  }>;
};
