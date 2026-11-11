import { AccessScopeData, TemporaryPermissionMode } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { OrderByDirection } from "@app/lib/types";

export enum OrgGroupsOrderBy {
  Name = "name",
  Slug = "slug",
  Role = "role"
}

export type TMembershipGroupGuardReturn = {
  group: { id: string; name: string };
};

export interface TMembershipGroupScopeFactory {
  onCreateMembershipGroupGuard: (arg: TCreateMembershipGroupDTO) => Promise<TMembershipGroupGuardReturn>;

  onUpdateMembershipGroupGuard: (arg: TUpdateMembershipGroupDTO) => Promise<TMembershipGroupGuardReturn>;
  onDeleteMembershipGroupGuard: (arg: TDeleteMembershipGroupDTO) => Promise<TMembershipGroupGuardReturn>;
  onListMembershipGroupGuard: (arg: TListMembershipGroupDTO) => Promise<void>;
  onGetMembershipGroupByGroupIdGuard: (arg: TGetMembershipGroupByGroupIdDTO) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "projectId"; value: string };
  getScopeDatabaseFields: (scope: AccessScopeData) => {
    scopeOrgId: string;
    scopeProjectId?: string | null;
  };
  isCustomRole: (role: string) => boolean;
}

export type TCreateMembershipGroupDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  data: {
    groupId: string;
    roles: {
      role: string;
      isTemporary: boolean;
      temporaryMode?: TemporaryPermissionMode.Relative;
      temporaryRange?: string;
      temporaryAccessStartTime?: string;
    }[];
  };
};

export type TUpdateMembershipGroupDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  selector: {
    groupId: string;
  };
  data: {
    isActive?: boolean;
    metadata?: { key: string; value: string }[];
    roles: {
      role: string;
      isTemporary: boolean;
      temporaryMode?: TemporaryPermissionMode.Relative;
      temporaryRange?: string;
      temporaryAccessStartTime?: string;
    }[];
  };
};

export type TListMembershipGroupDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  data: {
    limit?: number;
    offset?: number;
    search?: string;
    roles?: string[];
    orderBy?: OrgGroupsOrderBy;
    orderDirection?: OrderByDirection;
  };
};

export type TDeleteMembershipGroupDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  selector: {
    groupId: string;
  };
};

export type TGetMembershipGroupByGroupIdDTO = {
  actor: TActorContext;
  scopeData: AccessScopeData;
  selector: {
    groupId: string;
  };
};
