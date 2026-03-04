import { AccessScopeData } from "@app/db/schemas";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";

export interface TIdentityV2Factory {
  onCreateIdentityGuard: (arg: TCreateIdentityV2DTO) => Promise<void>;
  onUpdateIdentityGuard: (arg: TUpdateIdentityV2DTO) => Promise<void>;
  onDeleteIdentityGuard: (arg: TDeleteIdentityV2DTO) => Promise<void>;
  onListIdentityGuard: (arg: TListIdentityV2DTO) => Promise<(arg: { identityId: string }) => boolean>;
  onGetIdentityByIdGuard: (arg: TGetIdentityByIdV2DTO) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "projectId"; value: string };
}

export enum IdentityOrderBy {
  Name = "name",
  Role = "role"
}

export type TCreateIdentityV2DTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    name: string;
    hasDeleteProtection: boolean;
    metadata?: { key: string; value: string }[];
  };
};

export type TUpdateIdentityV2DTO = {
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

export type TDeleteIdentityV2DTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
  };
};

export type TGetIdentityByIdV2DTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
  };
};

export type TListIdentityV2DTO = {
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
