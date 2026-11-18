import { AccessScopeData, TemporaryPermissionMode } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ActorType } from "@app/lib/auth/actor-types";

export interface TAdditionalPrivilegesScopeFactory {
  onCreateAdditionalPrivilegesGuard: (arg: TCreateAdditionalPrivilegesDTO) => Promise<void>;
  onUpdateAdditionalPrivilegesGuard: (arg: TUpdateAdditionalPrivilegesDTO) => Promise<void>;
  onDeleteAdditionalPrivilegesGuard: (arg: TDeleteAdditionalPrivilegesDTO) => Promise<void>;
  onListAdditionalPrivilegesGuard: (arg: TListAdditionalPrivilegesDTO) => Promise<void>;
  onGetAdditionalPrivilegesByIdGuard: (
    arg: TGetAdditionalPrivilegesByIdDTO | TGetAdditionalPrivilegesByNameDTO
  ) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "projectId"; value: string };
}

export type TCreateAdditionalPrivilegesDTO = {
  actor: TActorContext;
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
  actor: TActorContext;
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
  actor: TActorContext;
  scopeData: AccessScopeData;
  selector: {
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  };
};

export type TDeleteAdditionalPrivilegesDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  selector: {
    id: string;
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  };
};

export type TGetAdditionalPrivilegesByIdDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  selector: {
    id: string;
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  };
};

export type TGetAdditionalPrivilegesByNameDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  selector: {
    name: string;
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  };
};
