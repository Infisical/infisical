import { AccessScopeData, TemporaryPermissionMode } from "@app/db/schemas/models";
import { OrgServiceActor } from "@app/lib/types";

export interface TMembershipGroupScopeFactory {
  onCreateMembershipGroupGuard: (arg: TCreateMembershipGroupDTO) => Promise<void>;

  onUpdateMembershipGroupGuard: (arg: TUpdateMembershipGroupDTO) => Promise<void>;
  onDeleteMembershipGroupGuard: (arg: TDeleteMembershipGroupDTO) => Promise<void>;
  onListMembershipGroupGuard: (arg: TListMembershipGroupDTO) => Promise<void>;
  onGetMembershipGroupByGroupIdGuard: (arg: TGetMembershipGroupByGroupIdDTO) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "namespaceId" | "projectId"; value: string };
  getScopeDatabaseFields: (scope: AccessScopeData) => {
    scopeOrgId: string;
    scopeNamespaceId?: string | null;
    scopeProjectId?: string | null;
  };
  isCustomRole: (role: string) => boolean;
}

export type TCreateMembershipGroupDTO = {
  permission: OrgServiceActor;
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
  permission: OrgServiceActor;
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
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    limit?: number;
    offset?: number;
    groupName?: string;
    roles?: string[];
  };
};

export type TDeleteMembershipGroupDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    groupId: string;
  };
};

export type TGetMembershipGroupByGroupIdDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    groupId: string;
  };
};
