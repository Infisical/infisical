import { AccessScopeData, TemporaryPermissionMode } from "@app/db/schemas/models";
import { OrgServiceActor } from "@app/lib/types";

import { ActorType } from "../auth/auth-type";

export interface TAdditionalPrivilegesScopeFactory {
  onCreateAdditionalPrivilegesGuard: (arg: TCreateAdditionalPrivilegesDTO) => Promise<void>;
  onUpdateAdditionalPrivilegesGuard: (arg: TUpdateAdditionalPrivilegesDTO) => Promise<void>;
  onDeleteAdditionalPrivilegesGuard: (arg: TDeleteAdditionalPrivilegesDTO) => Promise<void>;
  onListAdditionalPrivilegesGuard: (arg: TListAdditionalPrivilegesDTO) => Promise<void>;
  onGetAdditionalPrivilegesByIdGuard: (
    arg: TGetAdditionalPrivilegesByIdDTO | TGetAdditionalPrivilegesByNameDTO
  ) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "namespaceId" | "projectId"; value: string };
}

export type TCreateAdditionalPrivilegesDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
    name: string;
    permissions: unknown;
    isTemporary: boolean;
    temporaryMode?: TemporaryPermissionMode.Relative;
    temporaryRange?: string;
    temporaryAccessStartTime?: string;
  };
};

export type TUpdateAdditionalPrivilegesDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    id: string;
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  };
  data: Partial<{
    name: string;
    permissions: unknown;
    isTemporary: boolean;
    temporaryMode?: TemporaryPermissionMode.Relative;
    temporaryRange?: string;
    temporaryAccessStartTime?: string;
  }>;
};

export type TListAdditionalPrivilegesDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  };
};

export type TDeleteAdditionalPrivilegesDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    id: string;
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  };
};

export type TGetAdditionalPrivilegesByIdDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    id: string;
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  };
};

export type TGetAdditionalPrivilegesByNameDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    name: string;
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  };
};
