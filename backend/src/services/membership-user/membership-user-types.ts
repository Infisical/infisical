import { AccessScopeData, TemporaryPermissionMode } from "@app/db/schemas/models";
import { OrgServiceActor } from "@app/lib/types";

export interface TMembershipUserScopeFactory {
  onCreateMembershipUserGuard: (
    arg: TCreateMembershipUserDTO,
    newMembers: { id: string; email?: string | null }[]
  ) => Promise<void>;
  onCreateMembershipComplete: (
    arg: TCreateMembershipUserDTO,
    newMembers: { id: string; email?: string | null }[]
  ) => Promise<{ signUpTokens: { email: string; link: string }[] }>;

  onUpdateMembershipUserGuard: (arg: TUpdateMembershipUserDTO) => Promise<void>;
  onDeleteMembershipUserGuard: (arg: TDeleteMembershipUserDTO | TBulkDeleteMembershipByUsernameDTO) => Promise<void>;

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

export type TBulkDeleteMembershipByUsernameDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    usernames: string[];
  };
};

export type TGetMembershipUserByUserIdDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    userId: string;
  };
};

export type TListAvailableUsersDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
};
