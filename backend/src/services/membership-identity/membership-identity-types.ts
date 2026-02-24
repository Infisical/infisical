import { AccessScopeData, TemporaryPermissionMode } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";

export interface TMembershipIdentityScopeFactory {
  onCreateMembershipIdentityGuard: (arg: TCreateMembershipIdentityDTO) => Promise<void>;

  onUpdateMembershipIdentityGuard: (arg: TUpdateMembershipIdentityDTO) => Promise<void>;
  onDeleteMembershipIdentityGuard: (arg: TDeleteMembershipIdentityDTO) => Promise<void>;
  onListMembershipIdentityGuard: (arg: TListMembershipIdentityDTO) => Promise<(arg: { identityId: string }) => boolean>;
  onGetMembershipIdentityByIdentityIdGuard: (arg: TGetMembershipIdentityByIdentityIdDTO) => Promise<void>;
  getScopeField: (scope: AccessScopeData) => { key: "orgId" | "projectId"; value: string };
  getScopeDatabaseFields: (scope: AccessScopeData) => {
    scopeOrgId: string;
    scopeProjectId?: string | null;
  };
  isCustomRole: (role: string) => boolean;
}

export type TCreateMembershipIdentityDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    identityId: string;
    roles: {
      role: string;
      isTemporary: boolean;
      temporaryMode?: TemporaryPermissionMode.Relative;
      temporaryRange?: string;
      temporaryAccessStartTime?: string;
    }[];
  };
};

export type TUpdateMembershipIdentityDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
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

export type TListMembershipIdentityDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  data: {
    limit?: number;
    offset?: number;
    identityName?: string;
    roles?: string[];
  };
};

export type TDeleteMembershipIdentityDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
  };
};

export type TGetMembershipIdentityByIdentityIdDTO = {
  permission: OrgServiceActor;
  scopeData: AccessScopeData;
  selector: {
    identityId: string;
  };
};
