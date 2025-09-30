import { AccessScopeData, TemporaryPermissionMode } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";

export interface TMembershipUserScopeFactory {
  onCreateMembershipUserGuard: (arg: TCreateMembershipUserDTO) => Promise<void>;
  onCreateMembershipComplete: (arg: { id: string; email: string }[]) => Promise<void>;

  onUpdateMembershipUserGuard: (arg: TUpdateMembershipUserDTO) => Promise<void>;
  onDeleteMembershipUserGuard: (arg: TDeleteMembershipUserDTO) => Promise<void>;
  onListMembershipUserGuard: (arg: TListMembershipUserDTO) => Promise<void>;
  onGetMembershipUserByUserIdGuard: (arg: TGetMembershipUserByUserIdDTO) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "namespaceId" | "projectId"; value: string };
  getScopeDatabaseFields: (scope: AccessScopeData) => {
    scopeOrgId: string;
    scopeNamespaceId?: string | null;
    scopeProjectId?: string | null;
  };
  isCustomRole: (role: string) => boolean;
}

export type TCreateMembershipUserDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    usernames: string[];
    roles: {
      role: string;
      isTemporary: boolean;
      temporaryMode?: TemporaryPermissionMode.Relative;
      temporaryRange?: string;
      temporaryAccessStartTime?: string;
    }[];
  };
};

export type TUpdateMembershipUserDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    userId: string;
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

export type TListMembershipUserDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    limit?: number;
    offset?: number;
    username?: string;
    roles?: string[];
  };
};

export type TDeleteMembershipUserDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    userId: string;
  };
};

export type TGetMembershipUserByUserIdDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    userId: string;
  };
};
