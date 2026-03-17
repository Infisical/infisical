import { AccessScopeData, TemporaryPermissionMode } from "@app/db/schemas";
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
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "projectId"; value: string };
  getScopeDatabaseFields: (scope: AccessScopeData) => {
    scopeOrgId: string;
    scopeProjectId?: string | null;
  };
  isCustomRole: (role: string) => boolean;
}

// Shared error message constant used by org-membership-user-factory (throw site) and
// deprecated-project-membership-router (catch site). Keeping this in one place prevents
// the catch from silently breaking if the message is ever changed on one side only.
export const ORG_AUTH_ENFORCED_ERROR_MESSAGE =
  "Failed to invite user due to org-level auth enforced for organization";

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
