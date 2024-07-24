import { EnforcementLevel, PolicyType } from "../policies/enums";
import { TProjectPermission } from "../roles/types";
import { WorkspaceEnv } from "../workspace/types";

export type TAccessApprovalPolicy = {
  id: string;
  name: string;
  approvals: number;
  secretPath: string;
  envId: string;
  workspace: string;
  environment: WorkspaceEnv;
  projectId: string;
  approvers: string[];
  policyType: PolicyType;
  approversRequired: boolean;
  enforcementLevel: EnforcementLevel;
  updatedAt: Date;
  userApprovers?: { userId: string }[];
};

export type TAccessApprovalRequest = {
  id: string;
  policyId: string;
  privilegeId: string | null;
  requestedByUserId: string;
  requestedByUser: {
    email: string;
    firstName?: string;
    lastName?: string;
    userId: string;
    username: string;
  };
  createdAt: Date;
  updatedAt: Date;
  isTemporary: boolean;
  temporaryRange: string | null | undefined;

  permissions: TProjectPermission[] | null;

  // Computed
  environmentName: string;
  isApproved: boolean;

  privilege: {
    membershipId: string;
    isTemporary: boolean;
    temporaryMode?: string | null;
    temporaryRange?: string | null;
    temporaryAccessStartTime?: Date | null;
    temporaryAccessEndTime?: Date | null;
    permissions: TProjectPermission[];
    isApproved: boolean;
  } | null;

  policy: {
    id: string;
    name: string;
    approvals: number;
    approvers: string[];
    secretPath?: string | null;
    envId: string;
    enforcementLevel: EnforcementLevel;
  };

  reviewers: {
    member: string;
    status: string;
  }[];
};

export type TAccessApproval = {
  id: string;
  policyId: string;
  privilegeId: string;
  requestedBy: string;
};

export type TAccessRequestCount = {
  pendingCount: number;
  finalizedCount: number;
};

export type TProjectUserPrivilege = {
  projectMembershipId: string;
  slug: string;
  id: string;
  createdAt: Date;
  updatedAt: Date;
  permissions?: TProjectPermission[];
} & (
  | {
      isTemporary: true;
      temporaryMode: string;
      temporaryRange: string;
      temporaryAccessStartTime: string;
      temporaryAccessEndTime?: string;
    }
  | {
      isTemporary: false;
      temporaryMode?: null;
      temporaryRange?: null;
      temporaryAccessStartTime?: null;
      temporaryAccessEndTime?: null;
    }
);

export type TCreateAccessRequestDTO = {
  projectSlug: string;
} & Omit<TProjectUserPrivilege, "id" | "createdAt" | "updatedAt" | "slug" | "projectMembershipId">;

export type TGetAccessApprovalRequestsDTO = {
  projectSlug: string;
  envSlug?: string;
  authorProjectMembershipId?: string;
};

export type TGetAccessPolicyApprovalCountDTO = {
  projectSlug: string;
  envSlug: string;
};

export type TGetSecretApprovalPolicyOfBoardDTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
};

export type TCreateAccessPolicyDTO = {
  projectSlug: string;
  name?: string;
  environment: string;
  approverUserIds?: string[];
  approvals?: number;
  secretPath?: string;
  enforcementLevel?: EnforcementLevel;
};

export type TUpdateAccessPolicyDTO = {
  id: string;
  name?: string;
  approvers?: string[];
  secretPath?: string;
  environment?: string;
  approvals?: number;
  enforcementLevel?: EnforcementLevel;
  // for invalidating list
  projectSlug: string;
};

export type TDeleteSecretPolicyDTO = {
  id: string;
  // for invalidating list
  projectSlug: string;
};
