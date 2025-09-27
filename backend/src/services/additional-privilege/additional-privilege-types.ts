import { AccessScopeData, MembershipActors, TemporaryPermissionMode } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";

export interface TAdditionalPrivilegesScopeFactory {
  onCreateAdditionalPrivilegesGuard: (arg: TCreateAdditionalPrivilegesDTO) => Promise<{ membershipId: string }>;
  onUpdateAdditionalPrivilegesGuard: (arg: TUpdateAdditionalPrivilegesDTO) => Promise<{ membershipId: string }>;
  onDeleteAdditionalPrivilegesGuard: (arg: TDeleteAdditionalPrivilegesDTO) => Promise<{ membershipId: string }>;
  onListAdditionalPrivilegesGuard: (arg: TListAdditionalPrivilegesDTO) => Promise<{ membershipId: string }>;
  onGetAdditionalPrivilegesByIdGuard: (arg: TGetAdditionalPrivilegesByIdDTO) => Promise<{ membershipId: string }>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "namespaceId" | "projectId"; value: string };
}

export type TCreateAdditionalPrivilegesDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    actorId: string;
    actorType: MembershipActors;
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
    actorType: MembershipActors;
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
    actorType: MembershipActors;
  };
};

export type TDeleteAdditionalPrivilegesDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    id: string;
    actorId: string;
    actorType: MembershipActors;
  };
};

export type TGetAdditionalPrivilegesByIdDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    id: string;
    actorId: string;
    actorType: MembershipActors;
  };
};
